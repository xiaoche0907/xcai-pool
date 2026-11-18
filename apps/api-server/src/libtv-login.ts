import { spawn, execFile } from "node:child_process";
import { createHmac, randomBytes } from "node:crypto";
import { mkdir, access, mkdtemp } from "node:fs/promises";
import { createInterface } from "node:readline";
import { promisify } from "node:util";
import path from "node:path";
import { AppError } from "../../../packages/contracts/src/index.js";

const exec = promisify(execFile);
type LoginState = {
  status: "idle" | "starting" | "waiting" | "sms" | "ready" | "failed";
  url?: string;
  message?: string;
  requiresReplacement?: boolean;
};

function officialLoginUrl(line: string) {
  try {
    const url = new URL(line.trim());
    const callback = new URL(url.searchParams.get("callback_url") ?? "");
    if (
      url.origin === "https://www.liblib.tv" &&
      url.pathname === "/zh" &&
      !url.username &&
      !url.password &&
      !url.hash &&
      [...url.searchParams.keys()].length === 1 &&
      callback.protocol === "http:" &&
      callback.hostname === "127.0.0.1" &&
      !callback.username &&
      !callback.password &&
      callback.port &&
      callback.pathname === "/callback" &&
      !callback.search &&
      !callback.hash
    )
      return url.href;
  } catch {
    /* Ignore CLI output other than the official URL. */
  }
}

export class LibTVWebLogin {
  private state: LoginState = { status: "idle" };
  private stop?: () => void;
  private webExit?: Promise<void>;
  private sms?: {
    phoneFingerprint: string;
    expiresAt: number;
    attempts: number;
  };
  private readonly smsKey = randomBytes(32);
  private nextSmsAt = 0;
  private browserProfile?: { url: string; directory: string };
  constructor(
    private directory: string,
    private binary: string,
  ) {}

  isActive() {
    return ["starting", "waiting"].includes(this.state.status);
  }
  isAwaitingSms() {
    return this.state.status === "sms";
  }
  async cancelWeb() {
    if (this.state.status === "waiting" && this.stop && this.webExit) {
      const exit = this.webExit;
      this.state = { status: "idle" };
      this.stop();
      await exit;
    }
    return this.state;
  }

  markDuplicate() {
    this.state = {
      status: "failed",
      requiresReplacement: true,
      message: "刚授权的是已登记账号，请重新授权，或改用另一个手机号登录。",
    };
  }

  async openIsolatedBrowser() {
    const url = this.state.status === "waiting" ? this.state.url : undefined;
    if (!url)
      throw new AppError(
        "LIBTV_LOGIN_LINK_REQUIRED",
        "请先获取有效的 LibTV 登录链接。",
        409,
      );
    if (process.platform !== "win32")
      throw new AppError(
        "LIBTV_BROWSER_UNAVAILABLE",
        "请复制链接到本机浏览器的隐私窗口打开。",
        409,
      );

    const roots = [
      process.env["ProgramFiles(x86)"],
      process.env.ProgramFiles,
      process.env.LOCALAPPDATA,
    ].filter((root): root is string => Boolean(root));
    const browsers = [
      {
        executable: "Microsoft/Edge/Application/msedge.exe",
        privateMode: "--inprivate",
      },
      {
        executable: "Google/Chrome/Application/chrome.exe",
        privateMode: "--incognito",
      },
    ];
    for (const browser of browsers)
      for (const root of roots) {
        const executable = path.join(root, browser.executable);
        try {
          await access(executable);
        } catch {
          continue;
        }
        let profile = this.browserProfile;
        if (profile?.url !== url) {
          const directory = await mkdtemp(
            path.join(this.directory, "browser-"),
          );
          profile = { url, directory };
          this.browserProfile = profile;
        }
        if (this.state.status !== "waiting" || this.state.url !== url)
          throw new AppError(
            "LIBTV_LOGIN_LINK_REQUIRED",
            "登录链接已失效，请重新获取。",
            409,
          );
        const env: NodeJS.ProcessEnv = {};
        for (const key of [
          "PATH",
          "SystemRoot",
          "WINDIR",
          "TEMP",
          "TMP",
          "USERPROFILE",
          "LOCALAPPDATA",
          "APPDATA",
          "PROGRAMDATA",
        ]) {
          if (process.env[key]) env[key] = process.env[key];
        }
        const child = spawn(
          executable,
          [
            `--user-data-dir=${profile.directory}`,
            "--new-window",
            "--no-first-run",
            "--no-default-browser-check",
            browser.privateMode,
            url,
          ],
          {
            detached: true,
            stdio: "ignore",
            shell: false,
            windowsHide: false,
            env,
          },
        );
        try {
          await new Promise<void>((resolve, reject) => {
            child.once("spawn", resolve);
            child.once("error", reject);
          });
          child.unref();
          return { ok: true };
        } catch {
          /* Try the next installed browser. */
        }
      }
    throw new AppError(
      "LIBTV_BROWSER_UNAVAILABLE",
      "无法启动独立浏览器，请复制链接到隐私窗口打开。",
      409,
    );
  }

  async status(): Promise<LoginState> {
    if (this.state.status !== "idle") return this.state;
    try {
      await access(path.join(this.directory, "config", "credentials.json"));
      return this.state.status === "idle" ? { status: "ready" } : this.state;
    } catch {
      return this.state;
    }
  }

  async start(replace: boolean) {
    if (this.isActive() || this.stop) return this.state;
    const previous = this.state;
    this.state = { status: "starting" };
    try {
      const config = path.join(this.directory, "config");
      let credentialExists = false;
      try {
        await access(path.join(config, "credentials.json"));
        credentialExists = true;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      if (credentialExists && !replace)
        return (this.state = { status: "ready" });

      const options = await this.prepare();
      this.sms = undefined;
      this.browserProfile = undefined;
      const child = spawn(this.binary, ["login", "web"], {
        ...options,
        stdio: ["ignore", "pipe", "pipe"],
      });
      const timer = setTimeout(() => {
        this.state = {
          status: "failed",
          message: "授权超时，请重新获取登录链接。",
        };
        child.kill();
      }, 180_000);
      this.stop = () => child.kill();
      for (const stream of [child.stdout, child.stderr]) {
        const lines = createInterface({ input: stream });
        lines.on("line", (line) => {
          const url = officialLoginUrl(line);
          if (url && this.state.status === "starting")
            this.state = { status: "waiting", url };
        });
      }
      child.once("error", () => {
        this.state = { status: "failed", message: "无法启动 LibTV CLI。" };
      });
      this.webExit = new Promise<void>((resolve) =>
        child.once("close", (code) => {
          clearTimeout(timer);
          this.stop = undefined;
          this.webExit = undefined;
          resolve();
          if (!this.isActive()) return;
          this.state =
            code === 0
              ? { status: "ready" }
              : {
                  status: "failed",
                  message: "LibTV 登录未完成，请重新获取链接。",
                };
        }),
      );
      return this.state;
    } catch (error) {
      this.state = previous;
      if (error instanceof AppError) throw error;
      throw new AppError(
        "LIBTV_LOGIN_START_FAILED",
        "无法准备本机登录，请检查 LibTV CLI 和目录权限。",
        502,
      );
    }
  }

  private async prepare() {
    const config = path.join(this.directory, "config");
    const cwd = path.join(this.directory, "work");
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    if (process.platform === "win32") {
      const { stdout } = await exec("whoami.exe");
      await exec("icacls.exe", [
        this.directory,
        "/inheritance:r",
        "/grant:r",
        `${stdout.trim()}:(OI)(CI)F`,
        "*S-1-5-18:(OI)(CI)F",
      ]);
    }
    await Promise.all([
      mkdir(config, { recursive: true, mode: 0o700 }),
      mkdir(cwd, { recursive: true, mode: 0o700 }),
    ]);
    const env: NodeJS.ProcessEnv = { LIBTV_CONFIG_DIR: config };
    for (const key of [
      "PATH",
      "SystemRoot",
      "WINDIR",
      "TEMP",
      "TMP",
      "USERPROFILE",
      "HOME",
      "LANG",
      "LC_ALL",
    ]) {
      if (process.env[key]) env[key] = process.env[key];
    }
    const options = { cwd, env, shell: false, windowsHide: true };
    const version = await exec(this.binary, ["--version"], {
      ...options,
      timeout: 5000,
    });
    if (version.stdout.trim() !== "1.2.0")
      throw new AppError(
        "CLI_VERSION_MISMATCH",
        "需要已验证的 LibTV CLI 1.2.0",
        503,
      );
    return options;
  }

  async phone(
    phone: string,
    code?: string,
    replace = false,
  ): Promise<LoginState> {
    if (this.isActive() || this.stop)
      throw new AppError(
        "LIBTV_LOGIN_BUSY",
        "已有授权流程正在进行，请稍候。",
        409,
      );
    const now = Date.now();
    const phoneFingerprint = createHmac("sha256", this.smsKey)
      .update(phone)
      .digest("hex");
    const previous = this.state;
    const pending = this.sms;
    if (code !== undefined) {
      if (
        !pending ||
        pending.expiresAt <= now ||
        pending.phoneFingerprint !== phoneFingerprint
      )
        throw new AppError(
          "LIBTV_SMS_REQUIRED",
          "请为当前手机号重新发送验证码。",
          409,
        );
      if (pending.attempts >= 5)
        throw new AppError(
          "LIBTV_SMS_ATTEMPTS",
          "本轮尝试次数已用完，请重新获取验证码。",
          429,
        );
      pending.attempts++;
    } else if (now < this.nextSmsAt) {
      throw new AppError(
        "LIBTV_SMS_COOLDOWN",
        "请等待 60 秒后再发送验证码。",
        429,
      );
    }

    this.state = { status: "starting" };
    try {
      if (code === undefined && !replace) {
        try {
          await access(path.join(this.directory, "config", "credentials.json"));
          return (this.state = { status: "ready" });
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
        }
      }
      const options = await this.prepare();
      if (code === undefined) this.nextSmsAt = Date.now() + 60_000;
      const args = ["login", "phone", "--phone", phone];
      if (code !== undefined) args.push("--code", code);
      try {
        await exec(this.binary, args, {
          ...options,
          timeout: 20_000,
          maxBuffer: 64 * 1024,
        });
      } catch (failure) {
        const { stdout, stderr } = failure as {
          stdout?: string;
          stderr?: string;
        };
        const detail = `${stdout ?? ""} ${stderr ?? ""}`;
        if (/captcha|人机验证|安全验证|滑块/i.test(detail))
          throw new AppError(
            "LIBTV_CAPTCHA_REQUIRED",
            "LibTV 要求人机验证，请切换到官方网页登录完成。",
            409,
          );
        if (/频繁|频率|次数|rate.limit|too many/i.test(detail))
          throw new AppError(
            "LIBTV_SMS_LIMITED",
            "LibTV 限制了验证码请求，请稍后重试。",
            429,
          );
        if (code !== undefined)
          throw new AppError(
            "LIBTV_SMS_VERIFY_FAILED",
            "LibTV 未完成验证，请检查验证码或改用官方网页登录。",
            422,
          );
        throw new AppError(
          "LIBTV_SMS_SEND_FAILED",
          "LibTV 未确认发送短信，请稍后重试或改用官方网页登录。",
          502,
        );
      }
      if (code === undefined) {
        this.sms = {
          phoneFingerprint,
          expiresAt: Date.now() + 300_000,
          attempts: 0,
        };
        return (this.state = { status: "sms" });
      }
      this.sms = undefined;
      await access(path.join(this.directory, "config", "credentials.json"));
      return (this.state = { status: "ready" });
    } catch (error) {
      this.state = previous;
      if (error instanceof AppError) throw error;
      throw new AppError(
        "LIBTV_LOGIN_START_FAILED",
        "无法完成本机验证，请检查 LibTV CLI，或使用官方网页登录。",
        502,
      );
    }
  }

  close() {
    this.stop?.();
  }
}
