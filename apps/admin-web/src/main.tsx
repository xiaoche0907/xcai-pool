import { useState, useEffect, useMemo, Suspense, lazy } from "react";
import { createRoot } from "react-dom/client";
import { Refine } from "@refinedev/core";
import {
  Layers3,
  LayoutDashboard,
  Boxes,
  Users,
  Workflow,
  ScrollText,
  Server,
  LockKeyhole,
  LogOut,
  AlertCircle,
  Check,
  X,
  ArrowRight,
} from "lucide-react";
import { createApi, createDataProvider } from "./api.js";
import {
  Context,
  useApp,
  ErrorBox,
  Badge,
  Loading,
  type Config,
} from "./shared.js";
import Overview from "./pages/Overview.js";
import Connections from "./pages/Connections.js";
import Projects from "./pages/Projects.js";
import Logs from "./pages/Logs.js";
import Gateway from "./pages/Gateway.js";
import "./style.css";
const Models = lazy(() => import("./pages/Models.js"));
const pages = [
  ["overview", "总览", LayoutDashboard, "查看 LibTV 连接状态和本机 API 地址。"],
  ["models", "模型中心", Boxes, "检索 LibTV 模型、查看 Schema 并校验参数。"],
  ["connections", "账号池", Users, "管理 LibTV 授权、连接状态与账号别名。"],
  ["gateway", "网关", Server, "检查本机 API、复制接入配置与模型 ID。"],
  ["projects", "画布管理", Workflow, "查询画布、节点和连接关系。"],
  ["logs", "审计日志", ScrollText, "查阅脱敏的操作和故障记录。"],
] as const;
function Shell({ logout }: { logout: () => void }) {
  const { config } = useApp();
  const [page, setPage] = useState(location.hash.slice(1) || "overview");
  useEffect(() => {
    const h = () => setPage(location.hash.slice(1) || "overview");
    window.addEventListener("hashchange", h);
    return () => window.removeEventListener("hashchange", h);
  }, []);
  const current = pages.find((p) => p[0] === page) ?? pages[0];
  return (
    <div className="app">
      <header className="workbench-bar">
        <a className="brand" href="#overview">
          <span className="brand-icon">
            <Layers3 size={18} />
          </span>
          <span>XcAIPool</span>
        </a>
        <nav aria-label="工作台导航">
          {pages
            .filter((p) => config.role === "admin" || p[0] !== "logs")
            .map(([id, label, Icon]) => (
              <a
                key={id}
                href={`#${id}`}
                className={current[0] === id ? "active" : ""}
                aria-current={current[0] === id ? "page" : undefined}
              >
                <Icon size={18} />
                {label}
              </a>
            ))}
        </nav>
        <div className="session-tools">
          <Badge tone="green">API 已连接</Badge>
          <span className="role">
            {config.role === "admin" ? "管理员" : "只读用户"}
          </span>
          <button
            className="icon-button"
            onClick={logout}
            aria-label="退出工作台"
            title="退出工作台"
          >
            <LogOut size={16} />
          </button>
        </div>
      </header>
      <main>
        <div className="content">
          <div className="page-heading">
            <div>
              <h1>{current[1]}</h1>
              <p>{current[3]}</p>
            </div>
            <div className="stage">
              <LockKeyhole size={15} />
              <span>
                {config.generationEnabled ? "生成已启用" : "生成已关闭"}
              </span>
            </div>
          </div>
          {current[0] === "overview" ? (
            <Overview />
          ) : current[0] === "models" ? (
            <Suspense fallback={<Loading />}>
              <Models />
            </Suspense>
          ) : current[0] === "connections" ? (
            <Connections />
          ) : current[0] === "gateway" ? (
            <Gateway />
          ) : current[0] === "projects" ? (
            <Projects />
          ) : config.role === "admin" ? (
            <Logs />
          ) : (
            <p>管理员可查看审计日志。</p>
          )}
        </div>
      </main>
    </div>
  );
}
function App() {
  const [token, setToken] = useState(""),
    [config, setConfig] = useState<Config | null>(null),
    [input, setInput] = useState(""),
    [error, setError] = useState<unknown>(null),
    [loading, setLoading] = useState(false),
    [toast, setToast] = useState<{ text: string; error?: boolean } | null>(
      null,
    );
  const api = useMemo(() => createApi(token), [token]),
    provider = useMemo(() => createDataProvider(api), [api]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);
  if (!config)
    return (
      <div className="login">
        <form
          className="login-form"
          onSubmit={async (e) => {
            e.preventDefault();
            setLoading(true);
            setError(null);
            try {
              const c = await createApi(input)<Config>("config");
              setToken(input);
              setInput("");
              setConfig(c);
            } catch (e) {
              setError(e);
            } finally {
              setLoading(false);
            }
          }}
        >
          <div className="login-brand">
            <span className="brand-icon">
              <Layers3 size={21} />
            </span>
            <span>XcAIPool</span>
          </div>
          <h1>登录工作台</h1>
          <p className="muted">
            使用管理员或只读 API 密钥。密钥仅存于当前页面内存。
          </p>
          <label className="field-label">
            API 密钥
            <input
              aria-label="API 密钥"
              type="password"
              autoComplete="off"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              required
            />
          </label>
          <ErrorBox error={error} />
          <button className="primary" disabled={loading}>
            {loading ? "验证中…" : "连接工作台"}
            <ArrowRight size={16} />
          </button>
          <small>工作台认证独立于 LibTV 官方账号登录。</small>
        </form>
      </div>
    );
  return (
    <Refine
      key={token}
      dataProvider={provider}
      resources={[
        { name: "models" },
        { name: "connections" },
        { name: "projects" },
        { name: "admin/audit-events" },
      ]}
      options={{
        disableTelemetry: true,
        reactQuery: {
          clientConfig: {
            defaultOptions: {
              queries: { retry: false, refetchOnWindowFocus: false },
            },
          },
        },
      }}
    >
      <Context.Provider
        value={{
          api,
          config,
          notify: (text, error) => setToast({ text, error }),
        }}
      >
        <Shell
          logout={() => {
            setConfig(null);
            setToken("");
          }}
        />
        {toast && (
          <div
            role="status"
            className={`toast ${toast.error ? "failure" : ""}`}
          >
            {toast.error ? <AlertCircle size={17} /> : <Check size={17} />}
            <span>{toast.text}</span>
            <button aria-label="关闭通知" onClick={() => setToast(null)}>
              <X size={15} />
            </button>
          </div>
        )}
      </Context.Provider>
    </Refine>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
