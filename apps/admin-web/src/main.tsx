import { useState, useEffect, useMemo, useRef, Suspense, lazy } from "react";
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
  ListChecks,
  LockKeyhole,
  LogOut,
  AlertCircle,
  Check,
  X,
  ArrowRight,
  Download,
} from "lucide-react";
import { ApiError, createApi, createDataProvider } from "./api.js";
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
import Tasks from "./pages/Tasks.js";
import ThemeControl from "./ThemeControl.js";
import Updates from "./pages/Updates.js";
import "./style.css";
const Models = lazy(() => import("./pages/Models.js"));
const pages = [
  ["overview", "总览", LayoutDashboard, "查看 LibTV 连接状态和本机 API 地址。"],
  ["models", "模型中心", Boxes, "检索 LibTV 模型、查看 Schema 并校验参数。"],
  ["connections", "账号池", Users, "管理 LibTV 授权、连接状态与账号别名。"],
  ["gateway", "网关", Server, "检查本机 API、复制接入配置与模型 ID。"],
  ["projects", "画布管理", Workflow, "查询画布、节点和连接关系。"],
  ["tasks", "任务记录", ListChecks, "查看任务状态、生成结果与执行尝试。"],
  ["logs", "审计日志", ScrollText, "查阅脱敏的操作和故障记录。"],
  ["updates", "软件更新", Download, "检查并安装 GitHub 上的最新版本。"],
] as const;
function Shell({ logout }: { logout: () => void }) {
  const { config, apiHealth } = useApp();
  const [page, setPage] = useState(location.hash.slice(1) || "overview");
  useEffect(() => {
    const h = () => {
      const next = location.hash.slice(1) || "overview";
      if (!pages.some(([id]) => id === next)) return;
      setPage(next);
      window.scrollTo({ top: 0, behavior: "instant" });
    };
    window.addEventListener("hashchange", h);
    return () => window.removeEventListener("hashchange", h);
  }, []);
  const current = pages.find((p) => p[0] === page) ?? pages[0];
  return (
    <div className="app">
      <a className="skip-link" href="#main-content">
        跳到主内容
      </a>
      <header className="workbench-bar">
        <a className="brand" href="#overview">
          <span className="brand-icon">
            <Layers3 size={18} />
          </span>
          <span>XcAIPool</span>
        </a>
        <div className="session-tools">
          <Badge tone={apiHealth.error ? "amber" : "green"}>
            {apiHealth.error ? "API 连接异常" : "API 已连接"}
          </Badge>
          <ThemeControl />
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
      <nav className="workbench-nav" aria-label="工作台导航">
        {pages
          .filter(
            (p) =>
              config.role === "admin" || !["logs", "updates"].includes(p[0]),
          )
          .map(([id, label, Icon]) => (
            <a
              key={id}
              href={`#${id}`}
              className={current[0] === id ? "active" : ""}
              aria-current={current[0] === id ? "page" : undefined}
            >
              <Icon size={17} aria-hidden="true" />
              {label}
            </a>
          ))}
      </nav>
      <main id="main-content" tabIndex={-1}>
        <div className="content page-enter" key={current[0]}>
          <div className="page-heading">
            <div>
              <h1>{current[1]}</h1>
              <p>{current[3]}</p>
            </div>
            <div className="stage">
              <LockKeyhole size={15} />
              <span>
                {apiHealth.error
                  ? "生成状态未知"
                  : config.generationEnabled
                    ? "生成已启用"
                    : "生成已关闭"}
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
          ) : current[0] === "tasks" ? (
            <Tasks />
          ) : current[0] === "updates" && config.role === "admin" ? (
            <Updates />
          ) : current[0] === "logs" && config.role === "admin" ? (
            <Logs />
          ) : (
            <p>此页面仅供管理员使用。</p>
          )}
        </div>
      </main>
    </div>
  );
}
const sessionKey = "xcaipool.api-session";

function readSession() {
  try {
    return sessionStorage.getItem(sessionKey) ?? "";
  } catch {
    return "";
  }
}

function writeSession(token: string) {
  try {
    if (token) sessionStorage.setItem(sessionKey, token);
    else sessionStorage.removeItem(sessionKey);
  } catch {
    /* Login still works for this page when browser storage is unavailable. */
  }
}

function App() {
  const [savedToken] = useState(readSession);
  const [restoring, setRestoring] = useState(Boolean(savedToken));
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
  const [checkedAt, setCheckedAt] = useState<Date | null>(null);
  const [connectionError, setConnectionError] = useState<unknown>(null);
  const [checkingConfig, setCheckingConfig] = useState(false);
  const refreshConfigRef = useRef<(() => Promise<void>) | undefined>(undefined);
  useEffect(() => {
    if (!token) return;
    let active = true;
    let inFlight: Promise<void> | undefined;
    function refresh() {
      if (inFlight) return inFlight;
      setCheckingConfig(true);
      inFlight = api<Config>(
        "config",
        "GET",
        undefined,
        AbortSignal.timeout(8000),
      )
        .then((next) => {
          if (!active) return;
          setConfig(next);
          setCheckedAt(new Date());
          setConnectionError(null);
        })
        .catch((failure: unknown) => {
          if (!active) return;
          if (failure instanceof ApiError && failure.statusCode === 401) {
            writeSession("");
            setToken("");
            setConfig(null);
            setError(failure);
          } else setConnectionError(failure);
        })
        .finally(() => {
          inFlight = undefined;
          if (active) setCheckingConfig(false);
        });
      return inFlight;
    }
    refreshConfigRef.current = refresh;
    const refreshVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    const timer = setInterval(refreshVisible, 15_000);
    document.addEventListener("visibilitychange", refreshVisible);
    window.addEventListener("online", refreshVisible);
    return () => {
      active = false;
      refreshConfigRef.current = undefined;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refreshVisible);
      window.removeEventListener("online", refreshVisible);
    };
  }, [api, token]);
  useEffect(() => {
    if (!savedToken) return;
    let active = true;
    void createApi(savedToken)<Config>("config")
      .then((verified) => {
        if (!active) return;
        setToken(savedToken);
        setConfig(verified);
        setCheckedAt(new Date());
      })
      .catch((cause: unknown) => {
        if (!active) return;
        if (cause instanceof ApiError && cause.statusCode === 401)
          writeSession("");
        setError(cause);
      })
      .finally(() => {
        if (active) setRestoring(false);
      });
    return () => {
      active = false;
    };
  }, [savedToken]);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 6000);
    return () => clearTimeout(t);
  }, [toast]);
  if (restoring)
    return (
      <div className="login">
        <Loading />
      </div>
    );
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
              writeSession(input);
              setToken(input);
              setInput("");
              setConfig(c);
              setCheckedAt(new Date());
              setConnectionError(null);
              setCheckingConfig(false);
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
            <ThemeControl />
          </div>
          <h1>登录工作台</h1>
          <p className="muted">
            使用管理员或只读 API 密钥。同一标签页刷新后会自动恢复登录。
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
        { name: "tasks" },
        { name: "admin/audit-events" },
      ]}
      options={{
        disableTelemetry: true,
        reactQuery: {
          clientConfig: {
            defaultOptions: {
              queries: {
                retry: false,
                refetchOnWindowFocus: true,
                refetchInterval: 30_000,
              },
            },
          },
        },
      }}
    >
      <Context.Provider
        value={{
          api,
          config,
          apiHealth: {
            checkedAt,
            error: connectionError,
            checking: checkingConfig,
          },
          refreshConfig: () =>
            refreshConfigRef.current?.() ?? Promise.resolve(),
          notify: (text, error) => setToast({ text, error }),
        }}
      >
        <Shell
          logout={() => {
            writeSession("");
            setConfig(null);
            setToken("");
            setToast(null);
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
