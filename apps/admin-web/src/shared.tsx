import React, { createContext, useContext, useState } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { type Api, ApiError } from "./api.js";
export type Config = {
  role: string;
  generationEnabled: boolean;
  stage: string;
  cliVersion: string | null;
  cliStatus: "ready" | "unavailable" | "incompatible";
};
export const Context = createContext<{
  api: Api;
  config: Config;
  apiHealth: { checkedAt: Date | null; error: unknown; checking: boolean };
  refreshConfig: () => Promise<void>;
  notify: (text: string, error?: boolean) => void;
}>(null!);
export const useApp = () => useContext(Context);
export function cliLabel(config: Config) {
  if (config.cliStatus === "unavailable" || !config.cliVersion)
    return "LibTV CLI 未就绪";
  return `LibTV CLI ${config.cliVersion}${config.cliStatus === "incompatible" ? "（版本不兼容）" : ""}`;
}
export const formatDate = (s: string | null) =>
  s ? new Date(s).toLocaleString("zh-CN", { hour12: false }) : "尚未查询";
export function ErrorBox({ error }: { error: unknown }) {
  if (!error) return null;
  return (
    <div role="alert" className="error-box">
      <AlertCircle size={16} />
      {error instanceof ApiError
        ? `${error.code} · ${error.message}（${error.requestId ?? "—"}）`
        : error instanceof Error
          ? error.message
          : String(error)}
    </div>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: React.ReactNode;
  tone?: string;
}) {
  return (
    <span className={`badge ${tone}`}>
      <i />
      {children}
    </span>
  );
}
export function Loading() {
  return (
    <div className="empty" role="status">
      <RefreshCw size={20} className="spin" /> 正在读取真实 API…
    </div>
  );
}
export function useAction() {
  const { notify } = useApp();
  const [busy, setBusy] = useState(false);
  return {
    busy,
    run: async (work: () => Promise<unknown>, message: string) => {
      setBusy(true);
      try {
        await work();
        notify(message);
      } catch (e) {
        notify(e instanceof Error ? e.message : "操作失败", true);
      } finally {
        setBusy(false);
      }
    },
  };
}
export type ConnectionStatus = {
  id: string;
  alias: string;
  enabled: boolean;
  credentialPresent: boolean;
  healthStatus: string;
  generationBlockedReason: string | null;
  diagnosis?: { activeSpace?: string } | null;
};
export function connectionLabel(account: ConnectionStatus) {
  if (!account.enabled) return "已停用";
  if (!account.credentialPresent) return "缺少授权";
  if (account.healthStatus === "authenticated") return "上次诊断通过";
  return account.healthStatus === "error" ? "诊断失败" : "待诊断";
}
export function generationBlockMessage(reason: string | null) {
  if (reason === "LIBTV_GALLERY_CAPACITY_BLOCKED")
    return "LibTV 图库空间不足（1200000138）。请在 LibTV 释放空间或扩容。";
  return reason ? `生成受限（${reason}）。` : null;
}
export function AccountWarnings({
  accounts,
}: {
  accounts: ConnectionStatus[];
}) {
  return accounts
    .filter((account) => account.enabled)
    .map((account) => {
      const messages = [
        generationBlockMessage(account.generationBlockedReason),
        !account.credentialPresent
          ? "缺少 LibTV 授权，请重新登录。"
          : account.healthStatus === "error"
            ? "连接诊断失败，请在账号池重新诊断。"
            : null,
      ].filter(Boolean);
      if (!messages.length) return null;
      return (
        <div className="warning" key={account.id}>
          <AlertCircle size={18} aria-hidden="true" />
          <div>
            <strong>{account.alias}</strong>
            {messages.map((message) => (
              <span key={message}>{message}</span>
            ))}
          </div>
        </div>
      );
    });
}
