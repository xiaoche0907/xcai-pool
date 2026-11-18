import React, { createContext, useContext, useState } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { type Api, ApiError } from "./api.js";
export type Config = {
  role: string;
  generationEnabled: boolean;
  stage: string;
  cliVersion: string;
};
export const Context = createContext<{
  api: Api;
  config: Config;
  notify: (text: string, error?: boolean) => void;
}>(null!);
export const useApp = () => useContext(Context);
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
export function Warning() {
  return (
    <div className="warning">
      <AlertCircle size={18} />
      <div>
        <strong>LibTV 图库空间不足</strong>
        <span>
          上次生成测试返回 1200000138。需要在 LibTV 释放空间或扩容后再复验。
        </span>
      </div>
    </div>
  );
}
