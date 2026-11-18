import { useList } from "@refinedev/core";
import {
  ArrowUpRight,
  Boxes,
  Copy,
  Image,
  Terminal,
  Users,
  Video,
  Workflow,
} from "lucide-react";
import { ErrorBox, Loading, Warning, useApp } from "../shared.js";

export default function Overview() {
  const { config, notify } = useApp();
  const models = useList({ resource: "models", pagination: { mode: "off" } });
  const accounts = useList({
    resource: "connections",
    pagination: { mode: "off" },
  });
  const projects = useList({
    resource: "projects",
    pagination: { mode: "off" },
  });
  const error =
    models.query.error ?? accounts.query.error ?? projects.query.error;
  if (error) return <ErrorBox error={error} />;
  if (
    models.query.isPending ||
    accounts.query.isPending ||
    projects.query.isPending
  )
    return <Loading />;

  const rows = models.result.data;
  const totals = [
    {
      name: "图像模型",
      count: rows.filter((model) => model.modality === "image").length,
      icon: Image,
    },
    {
      name: "视频模型",
      count: rows.filter((model) => model.modality === "video").length,
      icon: Video,
    },
    { name: "已接入账号", count: accounts.result.data.length, icon: Users },
    { name: "已登记画布", count: projects.result.data.length, icon: Workflow },
  ];
  const links = [
    {
      title: "LibTV 账号",
      description: "官方授权、账号启停与连接诊断",
      href: "#connections",
      icon: Users,
    },
    {
      title: "模型目录",
      description: "模型筛选、Schema 与参数校验",
      href: "#models",
      icon: Boxes,
    },
    {
      title: "画布档案",
      description: "节点快照、来源与参考连接",
      href: "#projects",
      icon: Workflow,
    },
  ];
  const endpoint = new URL("/api/v1", window.location.origin).href;
  return (
    <>
      {accounts.result.data.some(
        (account) =>
          account.generationBlockedReason === "LIBTV_GALLERY_CAPACITY_BLOCKED",
      ) && <Warning />}
      <section className="summary-strip" aria-label="LibTV 数据统计">
        {totals.map(({ name, count, icon: Icon }) => (
          <div className="summary-item" key={name}>
            <Icon size={17} aria-hidden="true" />
            <span>{name}</span>
            <strong>{count}</strong>
          </div>
        ))}
      </section>
      <div className="overview-grid">
        <section className="panel overview-panel">
          <header className="panel-heading">
            <h2>LibTV 工作台</h2>
          </header>
          {links.map(({ title, description, href, icon: Icon }) => (
            <a className="overview-row" key={href} href={href}>
              <span className="row-icon">
                <Icon size={18} />
              </span>
              <span>
                <strong>{title}</strong>
                <small>{description}</small>
              </span>
              <ArrowUpRight size={16} className="row-arrow" />
            </a>
          ))}
        </section>
        <section className="panel overview-panel">
          <header className="panel-heading">
            <Terminal size={17} />
            <h2>网关连接</h2>
          </header>
          <div className="gateway-panel">
            <span className="field-caption">API 地址</span>
            <div className="endpoint">
              <code>{endpoint}</code>
              <button
                aria-label="复制 API 地址"
                title="复制 API 地址"
                className="icon-button"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(endpoint);
                    notify("已复制 API 地址");
                  } catch {
                    notify("无法访问剪贴板，请手动复制", true);
                  }
                }}
              >
                <Copy size={15} />
              </button>
            </div>
            <dl>
              <dt>认证</dt>
              <dd>Bearer API 密钥</dd>
              <dt>LibTV CLI</dt>
              <dd>{config.cliVersion}</dd>
              <dt>生成状态</dt>
              <dd>{config.generationEnabled ? "已启用" : "已关闭"}</dd>
            </dl>
          </div>
        </section>
      </div>
    </>
  );
}
