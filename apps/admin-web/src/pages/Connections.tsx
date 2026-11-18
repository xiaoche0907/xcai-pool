import { useState } from "react";
import { useList } from "@refinedev/core";
import { ChevronDown, RefreshCw } from "lucide-react";
import {
  useApp,
  useAction,
  Loading,
  ErrorBox,
  Warning,
  Badge,
  formatDate,
} from "../shared.js";
export default function Connections() {
  const { api, config } = useApp(),
    { busy, run } = useAction(),
    list = useList<any>({
      resource: "connections",
      pagination: { mode: "off" },
    });
  const [aliases, setAliases] = useState<Record<string, string>>({});
  return (
    <>
      <Warning />
      <div className="section-title">
        <h2>已授权连接</h2>
        {config.role === "admin" &&
          !list.result.data.some((c) => c.id === "account-02") && (
            <button
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await api("admin/connections/register", "POST", {});
                  await list.query.refetch();
                }, "第二个 LibTV 账号已接入")
              }
            >
              验证并登记第二个账号
            </button>
          )}
      </div>
      {config.role === "admin" &&
        !list.result.data.some((c) => c.id === "account-02") && (
          <p className="hint">
            新账号在本机运行 <code>corepack pnpm libtv:login</code>
            。用浏览器隐私窗口完成官方登录后，点击验证并登记。
          </p>
        )}
      <ErrorBox error={list.query.error} />
      {list.query.isPending ? (
        <Loading />
      ) : (
        <div className="panel account-list">
          {list.result.data.length === 0 && (
            <p className="empty">暂无已登记的 LibTV 账号。</p>
          )}
          {list.result.data.map((c) => (
            <details className="account-entry" key={c.id}>
              <summary className="account-heading">
                <div className="provider-mark">L</div>
                <span className="account-label">
                  <strong>{c.alias}</strong>
                  <small className="muted mono">{c.id} / LibTV CLI</small>
                </span>
                <Badge
                  tone={c.healthStatus === "authenticated" ? "green" : "amber"}
                >
                  {c.healthStatus === "authenticated"
                    ? "授权有效"
                    : c.healthStatus === "error"
                      ? "诊断失败"
                      : "等待诊断"}
                </Badge>
                <ChevronDown
                  size={17}
                  className="account-chevron"
                  aria-hidden="true"
                />
              </summary>
              <div className="account-details">
                <div className="account-grid">
                  <dl>
                    <dt>用户身份</dt>
                    <dd>{c.identity}</dd>
                    <dt>配置目录</dt>
                    <dd>
                      {c.isolatedDirectory ? "独立配置 / 工作目录" : "未隔离"}
                    </dd>
                    <dt>凭据文件</dt>
                    <dd>
                      {c.credentialPresent
                        ? "本地存在（内容不读取）"
                        : "不存在"}
                    </dd>
                    <dt>连接状态</dt>
                    <dd>{c.enabled ? "已启用" : "已手动停用"}</dd>
                  </dl>
                  <dl>
                    <dt>当前空间</dt>
                    <dd>{c.diagnosis?.activeSpace ?? "尚未实时查询"}</dd>
                    <dt>生成阻断</dt>
                    <dd className="amber-text">
                      {c.generationBlockedReason ?? "未记录；权限仍待验证"}
                    </dd>
                    <dt>最近诊断</dt>
                    <dd>{formatDate(c.lastCheckedAt)}</dd>
                    <dt>空间与账号</dt>
                    <dd>个人 / 团队不计为独立登录用户</dd>
                  </dl>
                </div>
                {config.role === "admin" && (
                  <div className="account-actions">
                    <input
                      aria-label="账号别名"
                      value={aliases[String(c.id)] ?? c.alias}
                      onChange={(e) =>
                        setAliases({
                          ...aliases,
                          [String(c.id)]: e.target.value,
                        })
                      }
                    />
                    <button
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          await api(`admin/connections/${c.id}`, "PATCH", {
                            alias: aliases[String(c.id)] ?? c.alias,
                          });
                          await list.query.refetch();
                        }, "别名已保存")
                      }
                    >
                      保存别名
                    </button>
                    <button
                      disabled={busy}
                      onClick={() =>
                        run(async () => {
                          await api(`admin/connections/${c.id}`, "PATCH", {
                            enabled: !c.enabled,
                          });
                          await list.query.refetch();
                        }, "连接状态已更新")
                      }
                    >
                      {c.enabled ? "停用连接" : "启用连接"}
                    </button>
                    <button
                      className="primary"
                      disabled={busy || !c.enabled}
                      onClick={() =>
                        run(async () => {
                          await api(
                            `admin/connections/${c.id}/diagnose`,
                            "POST",
                            {},
                          );
                          await list.query.refetch();
                        }, "官方账号只读诊断完成")
                      }
                    >
                      <RefreshCw size={14} />
                      诊断连接
                    </button>
                  </div>
                )}
              </div>
            </details>
          ))}
        </div>
      )}
    </>
  );
}
