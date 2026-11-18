import { useEffect, useState } from "react";
import { useList } from "@refinedev/core";
import {
  ChevronDown,
  Copy,
  Image,
  RefreshCw,
  Search,
  Server,
  Video,
} from "lucide-react";
import { Badge, ErrorBox, Loading, useApp, type Config } from "../shared.js";

type GatewayModel = {
  id: string;
  modelKey: string;
  directoryModelName: string;
  modality: "image" | "video";
  availabilityState: "listed" | "disabled" | "unverified";
};

const modelStates = {
  listed: "目录已收录",
  disabled: "已停用",
  unverified: "待核验",
};

export default function Gateway() {
  const { api, notify } = useApp();
  const models = useList<GatewayModel>({
    resource: "models",
    pagination: { mode: "off" },
  });
  const [search, setSearch] = useState("");
  const [revision, setRevision] = useState(0);
  const [probe, setProbe] = useState<{
    config: Config;
    checkedAt: Date;
  } | null>(null);
  const [checking, setChecking] = useState(true);
  const [probeError, setProbeError] = useState<unknown>(null);
  const baseUrl = new URL("/api/v1", window.location.origin).href;
  const example = `curl.exe -H "Authorization: Bearer <VIEWER_API_KEY>" "${baseUrl}/models?type=image"`;

  useEffect(() => {
    let active = true;
    api<Config>("config")
      .then((config) => {
        if (active) setProbe({ config, checkedAt: new Date() });
      })
      .catch((error) => {
        if (active) setProbeError(error);
      })
      .finally(() => {
        if (active) setChecking(false);
      });
    return () => {
      active = false;
    };
  }, [api, revision]);

  async function copy(value: string, label: string) {
    try {
      await navigator.clipboard.writeText(value);
      notify(`已复制${label}`);
    } catch {
      notify("无法访问剪贴板，请手动复制", true);
    }
  }

  const all = models.result.data;
  const query = search.trim().toLowerCase();
  const visible = all.filter((model) =>
    `${model.modelKey} ${model.directoryModelName}`
      .toLowerCase()
      .includes(query),
  );

  return (
    <div className="gateway-page">
      <section className="panel gateway-status" aria-label="网关状态">
        <header className="gateway-status-header">
          <span className="row-icon">
            <Server size={19} />
          </span>
          <div className="gateway-title">
            <h2>本机网关</h2>
            <p>
              {probe && !probeError
                ? `LibTV CLI ${probe.config.cliVersion} · ${probe.config.stage}`
                : "XcAIPool API"}
            </p>
          </div>
          <Badge tone={probeError ? "amber" : checking ? "neutral" : "green"}>
            {probeError ? "检查失败" : checking ? "检查中" : "运行中"}
          </Badge>
          <button
            disabled={checking || models.query.isFetching}
            onClick={() => {
              setChecking(true);
              setProbeError(null);
              setRevision((value) => value + 1);
              void models.query.refetch();
            }}
          >
            <RefreshCw size={14} />
            刷新状态
          </button>
        </header>
        <div className="gateway-status-body">
          <span className="muted">API 地址</span>
          <code>{baseUrl}</code>
          <button
            className="icon-button"
            aria-label="复制网关地址"
            title="复制网关地址"
            onClick={() => void copy(baseUrl, "网关地址")}
          >
            <Copy size={15} />
          </button>
          {probe && !probeError && (
            <small className="gateway-checked">
              上次检查{" "}
              {probe.checkedAt.toLocaleTimeString("zh-CN", { hour12: false })}
            </small>
          )}
        </div>
      </section>
      <ErrorBox error={probeError} />

      <details className="panel gateway-access">
        <summary>
          <ChevronDown size={16} />
          <strong>接入配置</strong>
          <code>{baseUrl}</code>
        </summary>
        <div className="gateway-access-body">
          <p>
            通过自定义 HTTP 接口调用。请求头使用{" "}
            <code>Authorization: Bearer &lt;VIEWER_API_KEY&gt;</code>。
          </p>
          <div className="gateway-command">
            <code>{example}</code>
            <button
              className="icon-button"
              aria-label="复制调用示例"
              title="复制调用示例"
              onClick={() => void copy(example, "调用示例")}
            >
              <Copy size={15} />
            </button>
          </div>
        </div>
      </details>

      <section aria-label="网关模型目录">
        <div className="gateway-model-heading">
          <h2>
            模型目录 <span>{models.query.isSuccess ? all.length : "—"}</span>
          </h2>
          <label className="search">
            <Search size={15} />
            <input
              aria-label="查找网关模型"
              type="search"
              placeholder="查找模型或 ID"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <button
            disabled={!models.query.isSuccess || !all.length}
            onClick={() =>
              void copy(
                all.map((model) => model.modelKey).join("\n"),
                "全部模型 ID",
              )
            }
          >
            复制全部 ID
          </button>
        </div>
        <ErrorBox error={models.query.error} />
        {models.query.isPending ? (
          <Loading />
        ) : (
          !models.query.isError && (
            <ul className="panel gateway-model-list">
              {visible.map((model) => {
                const Icon = model.modality === "image" ? Image : Video;
                return (
                  <li key={model.modelKey}>
                    <span className={`row-icon ${model.modality}`}>
                      <Icon size={17} />
                    </span>
                    <div className="gateway-model-name">
                      <code>{model.modelKey}</code>
                      <small>
                        {model.directoryModelName} ·{" "}
                        {model.modality === "image" ? "图像" : "视频"}
                      </small>
                    </div>
                    <Badge
                      tone={
                        model.availabilityState === "disabled"
                          ? "amber"
                          : "neutral"
                      }
                    >
                      {modelStates[model.availabilityState]}
                    </Badge>
                    <button
                      className="icon-button"
                      aria-label={`复制模型 ID ${model.modelKey}`}
                      title="复制模型 ID"
                      onClick={() => void copy(model.modelKey, "模型 ID")}
                    >
                      <Copy size={15} />
                    </button>
                  </li>
                );
              })}
              {!visible.length && (
                <li className="empty">
                  {all.length ? "没有匹配的模型" : "暂无模型"}
                </li>
              )}
            </ul>
          )
        )}
      </section>
    </div>
  );
}
