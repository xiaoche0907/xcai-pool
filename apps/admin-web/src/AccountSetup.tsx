import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Copy, X } from "lucide-react";
import { ApiError } from "./api.js";
import { ErrorBox, useApp } from "./shared.js";

type LoginState = {
  status: "idle" | "starting" | "waiting" | "sms" | "ready" | "failed";
  url?: string;
  message?: string;
  requiresReplacement?: boolean;
  retryAt?: number;
};

export default function AccountSetup({
  close,
  registered,
}: {
  close: () => void;
  registered: () => Promise<unknown>;
}) {
  const { api, notify } = useApp();
  const dialog = useRef<HTMLDialogElement>(null);
  const [alias, setAlias] = useState("");
  const [state, setState] = useState<LoginState | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [pollError, setPollError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [replace, setReplace] = useState(false);
  const [method, setMethod] = useState<"web" | "phone">("web");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [cooldown, setCooldown] = useState(0);
  const [browserNotice, setBrowserNotice] = useState("");
  const [switching, setSwitching] = useState(false);
  const replacement = replace || state?.requiresReplacement === true;
  const isWebPending =
    state?.status === "starting" || state?.status === "waiting";
  const canUsePhone =
    method === "phone" &&
    !isWebPending &&
    (state?.status !== "ready" || replacement);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);
  useEffect(() => {
    const poll =
      !state || ["starting", "waiting", "sms"].includes(state.status);
    if (!poll || switching || busy) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function check() {
      try {
        const next = await api<LoginState>(
          "admin/connections/login",
          "GET",
          undefined,
          AbortSignal.timeout(8000),
        );
        if (!active) return;
        setPollError(null);
        setState(next);
        if (next.status === "sms" && !state) setMethod("phone");
        if (["starting", "waiting", "sms"].includes(next.status))
          timer = setTimeout(check, next.status === "sms" ? 3000 : 1200);
      } catch (error) {
        if (active) {
          setPollError(error);
          timer = setTimeout(check, 3000);
        }
      }
    }
    if (!state) void check();
    else timer = setTimeout(check, 1200);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [api, state?.status, switching, busy]);

  useEffect(() => {
    const retryAt = state?.retryAt;
    const update = () =>
      setCooldown(Math.max(0, Math.ceil(((retryAt ?? 0) - Date.now()) / 1000)));
    update();
    if (!retryAt) return;
    const timer = setInterval(update, 1000);
    return () => clearInterval(timer);
  }, [state?.retryAt]);

  async function start(forceReplacement = replacement) {
    setBusy(true);
    setError(null);
    setBrowserNotice("");
    try {
      setState(
        await api<LoginState>("admin/connections/login", "POST", {
          replace: forceReplacement,
        }),
      );
      setReplace(false);
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  }

  async function changeMethod(next: "web" | "phone") {
    setCode("");
    setError(null);
    setBrowserNotice("");
    if (next === "phone" && state?.status === "waiting") {
      setSwitching(true);
      try {
        const current = await api<LoginState>(
          "admin/connections/login/cancel",
          "POST",
          {},
        );
        if (current.status === "starting" || current.status === "waiting")
          throw new Error("网页授权仍在进行，请稍后重试。");
        setState(current);
        setReplace(true);
      } catch (error) {
        setError(error);
        return;
      } finally {
        setSwitching(false);
      }
    } else if (state?.status === "ready" && next === "phone") {
      setReplace(true);
    }
    setMethod(next);
  }

  async function openBrowser() {
    setBusy(true);
    setError(null);
    try {
      await api("admin/connections/login/open-browser", "POST", {});
      setBrowserNotice(
        "已请求打开独立登录窗口，请在新窗口扫码或登录另一个账号。",
      );
    } catch (error) {
      setError(error);
    } finally {
      setBusy(false);
    }
  }

  async function copyLoginLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setBrowserNotice("已复制链接。请粘贴到手动打开的隐私窗口。");
    } catch {
      setBrowserNotice("无法读取剪贴板权限，请展开链接并手动复制。");
    }
  }

  async function submitPhone(verify: boolean) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api<LoginState>(
        "admin/connections/login/phone",
        "POST",
        {
          phone,
          ...(verify ? { code } : { replace: replacement }),
        },
      );
      setState(result);
      if (result.status === "ready") {
        setCode("");
        setPhone("");
      }
      setReplace(false);
    } catch (error) {
      setError(error);
      if (verify) setCode("");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    setBusy(true);
    setError(null);
    try {
      await api("admin/connections/register", "POST", {
        ...(alias.trim() && { alias: alias.trim() }),
      });
      await registered();
      notify("LibTV 账号已登记");
      close();
    } catch (error) {
      setError(error);
      if (
        error instanceof ApiError &&
        ["LIBTV_DUPLICATE_USER", "LIBTV_NOT_AUTHENTICATED"].includes(error.code)
      )
        setReplace(true);
      if (error instanceof ApiError && error.code === "LIBTV_DUPLICATE_USER")
        setState({
          status: "failed",
          requiresReplacement: true,
          message: "刚授权的是已登记账号。请重新授权另一个账号。",
        });
    } finally {
      setBusy(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className="workbench-dialog"
      aria-labelledby="account-setup-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <header className="dialog-heading">
        <div>
          <h2 id="account-setup-title">添加账号</h2>
          <p>完成 LibTV 官方授权后，保存到账号池。</p>
        </div>
        <button
          className="icon-button"
          aria-label="关闭添加账号"
          onClick={close}
        >
          <X size={18} />
        </button>
      </header>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (state?.status === "ready" && !replacement) void save();
        }}
      >
        <div className="dialog-body">
          <label className="field-label">
            账号名称
            <input
              value={alias}
              maxLength={80}
              onChange={(event) => setAlias(event.target.value)}
              placeholder="例如：LibTV 创作账号"
            />
          </label>
          <dl className="dialog-fields">
            <div>
              <dt>平台</dt>
              <dd>LibTV</dd>
            </div>
            <div>
              <dt>添加方式</dt>
              <dd>{method === "phone" ? "手机号验证码" : "官方网页登录"}</dd>
            </div>
            <div>
              <dt>出口</dt>
              <dd>本机直连</dd>
            </div>
          </dl>
          <label className="field-label">
            登录方式
            <select
              value={method}
              disabled={
                !state || busy || switching || state.status === "starting"
              }
              onChange={(event) =>
                void changeMethod(
                  event.target.value === "phone" ? "phone" : "web",
                )
              }
            >
              <option value="web">官方网页 / 微信扫码</option>
              <option value="phone">手机号验证码</option>
            </select>
          </label>
          {canUsePhone && (
            <div className="phone-login-fields">
              <label className="field-label">
                手机号
                <input
                  type="tel"
                  autoComplete="tel-national"
                  inputMode="numeric"
                  maxLength={11}
                  value={phone}
                  disabled={busy}
                  onChange={(event) => {
                    setPhone(event.target.value.replace(/\D/g, ""));
                    setCode("");
                  }}
                />
              </label>
              <label className="field-label">
                短信验证码
                <input
                  autoComplete="one-time-code"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  disabled={busy || state?.status !== "sms"}
                  onChange={(event) =>
                    setCode(event.target.value.replace(/\D/g, ""))
                  }
                />
              </label>
              <button
                type="button"
                disabled={busy || cooldown > 0 || !/^1[3-9]\d{9}$/.test(phone)}
                onClick={() => void submitPhone(false)}
              >
                {cooldown ? `${cooldown} 秒后重发` : "发送验证码"}
              </button>
            </div>
          )}
          <div className="dialog-status" role="status">
            {pollError
              ? "暂时无法读取授权状态，正在重试。"
              : switching
                ? "正在切换手机号登录…"
                : !state
                  ? "正在检查本地授权…"
                  : state.status === "starting"
                    ? "正在启动官方登录…"
                    : state.status === "waiting"
                      ? "等待 LibTV 授权。请用本机浏览器的隐私窗口登录另一个账号。"
                      : state.status === "ready" && !replacement
                        ? "已检测到授权，可保存并验证账号。"
                        : method === "phone"
                          ? state.status === "sms"
                            ? "LibTV CLI 已确认发送请求，请查收短信并验证。"
                            : (state.message ??
                              "输入中国大陆手机号，由 LibTV 发送验证码。")
                          : (state.message ??
                            "打开 LibTV 官方网页后，可选择页面提供的登录方式，例如微信扫码。")}
          </div>
          {state?.status === "waiting" && state.url && (
            <div className="dialog-link">
              <div className="login-link-actions">
                <button
                  type="button"
                  className="primary"
                  disabled={busy}
                  onClick={() => void openBrowser()}
                >
                  打开独立登录窗口 <ArrowUpRight size={15} />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (state.url) void copyLoginLink(state.url);
                  }}
                >
                  <Copy size={15} />
                  复制登录链接
                </button>
              </div>
              <p className="hint">
                {browserNotice ||
                  "独立窗口使用单独的浏览器配置。也可将链接复制到手动打开的隐私窗口。"}
              </p>
              <details>
                <summary>显示登录链接</summary>
                <input
                  aria-label="官方登录链接"
                  readOnly
                  value={state.url}
                  onFocus={(event) => event.target.select()}
                />
              </details>
            </div>
          )}
          <ErrorBox error={error ?? pollError} />
        </div>
        <footer className="dialog-actions">
          <button type="button" onClick={close}>
            关闭
          </button>
          {method === "web" &&
            state &&
            (["idle", "failed", "sms"].includes(state.status) ||
              replacement) && (
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() => void start()}
              >
                {replacement ? "重新授权" : "获取官方登录链接"}
              </button>
            )}
          {canUsePhone && state?.status === "sms" && (
            <button
              type="button"
              className="primary"
              disabled={
                busy || !/^1[3-9]\d{9}$/.test(phone) || !/^\d{6}$/.test(code)
              }
              onClick={() => void submitPhone(true)}
            >
              验证手机号
            </button>
          )}
          {state?.status === "ready" && !replacement && (
            <>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  method === "web" ? void start(true) : setReplace(true)
                }
              >
                换另一个账号
              </button>
              <button type="submit" className="primary" disabled={busy}>
                {busy ? "正在验证…" : "保存账号"}
              </button>
            </>
          )}
        </footer>
      </form>
    </dialog>
  );
}
