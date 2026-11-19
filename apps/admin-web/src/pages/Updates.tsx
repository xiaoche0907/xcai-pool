import { useEffect, useRef, useState } from "react";
import { Download, ExternalLink, RefreshCw } from "lucide-react";
import ConfirmDialog from "../ConfirmDialog.js";
import { ErrorBox, useApp } from "../shared.js";

type Status = {
  version: string | null;
  current: string | null;
  updating: boolean;
  result: { state: "success" | "failed"; message: string } | null;
};
type Check = { latest: string; available: boolean; reason: string | null };

export default function Updates() {
  const { api } = useApp();
  const [status, setStatus] = useState<Status>();
  const [check, setCheck] = useState<Check>();
  const [checking, setChecking] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<unknown>();
  const updateStatus = useRef<HTMLParagraphElement>(null);
  const installDeadline = useRef<number | null>(null);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const next = await api<Status>(
          "admin/update",
          "GET",
          undefined,
          AbortSignal.timeout(8000),
        );
        if (!active) return;
        setStatus(next);
        const running = next.updating;
        if (running && !installDeadline.current)
          installDeadline.current = Date.now() + 35 * 60_000;
        setInstalling(running);
        if (installing && !running) {
          installDeadline.current = null;
          if (!next.result)
            setError(
              new Error(
                "服务已恢复连接，但未返回安装结果。请重新检查当前版本。",
              ),
            );
          else setError(null);
        }
        if (running) timer = setTimeout(poll, 2000);
      } catch (failure) {
        if (!active) return;
        if (installing && (installDeadline.current ?? 0) > Date.now())
          timer = setTimeout(poll, 2000);
        else {
          setInstalling(false);
          setError(failure);
        }
      }
    }
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [api, installing]);

  return (
    <section className="panel update-panel" aria-labelledby="update-heading">
      <div className="section-title">
        <h2 id="update-heading">版本信息</h2>
        <a
          href="https://github.com/xiaoche0907/xcai-pool/commits/main"
          target="_blank"
          rel="noreferrer"
          className="update-source"
        >
          GitHub main <ExternalLink size={14} aria-hidden="true" />
        </a>
      </div>
      <dl className="dialog-fields update-fields">
        <div>
          <dt>当前版本</dt>
          <dd>
            {status?.version ? `v${status.version}` : "—"}{" "}
            {status?.current && <code>{status.current.slice(0, 7)}</code>}
          </dd>
        </div>
        <div>
          <dt>GitHub 最新提交</dt>
          <dd>
            {check ? <code>{check.latest.slice(0, 7)}</code> : "尚未检查"}
          </dd>
        </div>
      </dl>
      <p
        className="update-status"
        role="status"
        tabIndex={-1}
        ref={updateStatus}
      >
        {installing
          ? "正在更新，服务重启期间页面会自动尝试重新连接。"
          : status?.result?.message ||
            (check
              ? check.available
                ? (check.reason ?? "发现可安装的更新。")
                : status?.current
                  ? "当前已是最新版本。"
                  : (check.reason ?? "无法识别当前安装的提交。")
              : "检查 GitHub 上的最新提交。")}
      </p>
      <ErrorBox error={error} />
      <div className="update-actions">
        <button
          disabled={checking || installing}
          onClick={async () => {
            setChecking(true);
            setError(null);
            setCheck(undefined);
            setStatus((previous) => previous && { ...previous, result: null });
            try {
              setCheck(await api<Check>("admin/update/check", "POST"));
            } catch (failure) {
              setError(failure);
            } finally {
              setChecking(false);
            }
          }}
        >
          <RefreshCw
            size={15}
            className={checking ? "spin" : undefined}
            aria-hidden="true"
          />
          {checking ? "正在检查" : "检查更新"}
        </button>
        {check?.available &&
          !check.reason &&
          check.latest !== status?.current &&
          !installing && (
            <button className="primary" onClick={() => setConfirming(true)}>
              <Download size={15} aria-hidden="true" /> 安装更新
            </button>
          )}
        {status?.result?.state === "success" && !installing && (
          <button onClick={() => location.reload()}>重新加载工作台</button>
        )}
      </div>
      {confirming && check && (
        <ConfirmDialog
          icon={Download}
          title="安装 GitHub 更新？"
          description="服务会短暂重启，安装依赖并应用数据库迁移。本地配置和 LibTV 授权继续沿用。"
          subject={<code>{check.latest.slice(0, 7)}</code>}
          confirmLabel="安装并重启"
          pendingLabel="正在提交"
          onConfirm={async () => {
            await api("admin/update/install", "POST", { commit: check.latest });
            installDeadline.current = Date.now() + 35 * 60_000;
            setInstalling(true);
          }}
          onClose={(confirmed) => {
            setConfirming(false);
            if (confirmed) updateStatus.current?.focus();
          }}
        />
      )}
    </section>
  );
}
