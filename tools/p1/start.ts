import { fork, spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import {
  commitPattern,
  fetchUpdate,
  git,
  installBlocker,
  type InstallRequest,
  type UpdateResult,
} from "./update-source.js";

const root = process.cwd();
const pnpm = process.env.npm_execpath;
if (!pnpm) throw new Error("Start XcAIPool with corepack pnpm start.");

function runPnpm(...args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const command = spawn(process.execPath, [pnpm!, ...args], {
      cwd: root,
      stdio: args[0] === "libtv:install" ? "inherit" : "ignore",
      windowsHide: true,
      timeout: 10 * 60_000,
    });
    command.once("error", reject);
    command.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(args[0] + " failed."));
    });
  });
}

let child: ChildProcess;
let installing = false;
let stopping = false;

function start(result: UpdateResult | null = null) {
  const server = fork("apps/api-server/src/main.ts", [], {
    cwd: root,
    execArgv: ["--import", "tsx"],
    env: {
      ...process.env,
      XCAIPOOL_SUPERVISED: "1",
      XCAIPOOL_UPDATE_RESULT: result ? JSON.stringify(result) : "",
    },
  });
  child = server;
  return new Promise<void>((resolve, reject) => {
    const deadline = setTimeout(() => {
      server.kill();
      reject(new Error("Service did not become ready."));
    }, 30_000);
    server.on("message", (message: InstallRequest | { type: "ready" }) => {
      if (message?.type === "ready") {
        clearTimeout(deadline);
        resolve();
      } else if (
        message?.type === "install" &&
        commitPattern.test(message.commit)
      ) {
        void install(server, message.commit);
      }
    });
    server.once("error", reject);
    server.once("exit", (code) => {
      clearTimeout(deadline);
      reject(new Error("Service exited during startup."));
      if (!installing && !stopping) process.exitCode = code ?? 1;
    });
  });
}

async function stop(server: ChildProcess | undefined) {
  if (!server?.connected) return;
  const exited = once(server, "exit");
  const deadline = setTimeout(() => server.kill(), 12_000);
  server.send({ type: "shutdown" }, (error) => {
    if (error) server.kill();
  });
  try {
    await exited;
  } finally {
    clearTimeout(deadline);
  }
}

async function install(server: ChildProcess, requested: string) {
  if (installing || stopping || server !== child) return;
  installing = true;
  let original: string | undefined;
  let downtime = false;
  let migrationApplied = false;
  let stage = "检查本地工作目录失败。";
  try {
    const blocker = await installBlocker(root);
    if (blocker) throw new Error((stage = blocker));
    original = await git(root, "rev-parse", "HEAD");
    stage = "下载 GitHub 版本失败，请检查网络后重试。";
    await fetchUpdate(root).catch((error: Error) => {
      stage = error.message;
      throw error;
    });
    const fetched = await git(root, "rev-parse", "FETCH_HEAD");
    stage = "GitHub 版本已变化或已安装，请重新检查更新。";
    if (requested !== fetched || fetched === original) throw new Error(stage);
    stage = "本地版本与 GitHub 不在同一更新路径，无法直接升级。";
    await git(root, "merge-base", "--is-ancestor", original, fetched);
    stage = "目标版本包含本地配置或授权目录，已拒绝安装。";
    const changed = await git(
      root,
      "diff",
      "--name-only",
      "-z",
      original,
      fetched,
    );
    if (
      changed
        .split("\0")
        .some(
          (file) =>
            file !== ".env.example" &&
            /^\.local(?:\/|$)|^\.env(?:\.|$)|(?:^|\/)credentials\.json$/i.test(
              file,
            ),
        )
    )
      throw new Error(stage);
    const lateBlocker = await installBlocker(root);
    if (lateBlocker) throw new Error((stage = lateBlocker));
    if (stopping) return;
    downtime = true;
    stage = "无法停止当前服务。";
    await stop(server);
    stage = "无法快进更新 Git 工作目录。";
    await git(root, "merge", "--ff-only", "--no-overwrite-ignore", fetched);
    stage = "安装新版本依赖失败。";
    await runPnpm("install", "--frozen-lockfile");
    stage = "准备 LibTV CLI 失败，请查看服务启动终端。";
    await runPnpm("libtv:install");
    stage = "构建新版本失败。";
    await runPnpm("build");
    stage = "数据库迁移失败。";
    await runPnpm("db:migrate");
    migrationApplied = true;
    stage = "新版本未能启动。";
    await start({ state: "success", message: "更新完成，服务已重新启动。" });
  } catch {
    if (!downtime) {
      if (server.connected)
        server.send(
          {
            type: "update-result",
            result: { state: "failed", message: stage },
          },
          () => {},
        );
      return;
    }
    try {
      await stop(child);
      if ((await git(root, "rev-parse", "HEAD")) !== original) {
        await git(root, "reset", "--keep", original!);
        await runPnpm("install", "--frozen-lockfile");
        await runPnpm("build");
      }
      await start({
        state: "failed",
        message:
          stage +
          "已恢复原版本。" +
          (migrationApplied ? "已成功执行的数据库迁移仍保留。" : ""),
      });
    } catch {
      console.error(stage + "自动恢复失败。请检查安装目录并手动启动服务。");
      process.exitCode = 1;
    }
  } finally {
    installing = false;
  }
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    stopping = true;
    void stop(child);
  });
}

try {
  await runPnpm("libtv:install");
} catch {
  console.warn(
    "LibTV CLI setup did not complete. The dashboard will open. To retry, run corepack pnpm libtv:install.",
  );
}
if (!stopping) await start();
