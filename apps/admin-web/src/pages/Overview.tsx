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
import { Badge, ErrorBox, Loading, Warning, useApp } from "../shared.js";

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
  const connections = accounts.result.data;
  const active = connections.filter(
    (account) =>
      account.enabled &&
      account.credentialPresent &&
      account.healthStatus === "authenticated",
  ).length;
  const totals = [
    {
      name: "图像模型",
      count: rows.filter((model) => model.modality === "image").length,
      icon: Image,
      href: "#models",
      hint: "LibTV 模型目录",
    },
    {
      name: "视频模型",
      count: rows.filter((model) => model.modality === "video").length,
      icon: Video,
      href: "#models",
      hint: "LibTV 模型目录",
    },
    {
      name: "已接入账号",
      count: connections.length,
      icon: Users,
      href: "#connections",
      hint: `${active} 个连接授权有效`,
    },
    {
      name: "已登记画布",
      count: projects.result.data.length,
      icon: Workflow,
      href: "#projects",
      hint: "上游画布快照",
    },
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
        {totals.map(({ name, count, icon: Icon, href, hint }) => (
          <a className="summary-item" key={name} href={href}>
            <span className="metric-label">
              <Icon size={16} aria-hidden="true" />
              {name}
              <ArrowUpRight
                size={13}
                className="metric-arrow"
                aria-hidden="true"
              />
            </span>
            <strong>{count}</strong>
            <small>{hint}</small>
          </a>
        ))}
      </section>
      <div className="overview-grid">
        <section className="panel overview-panel">
          <header className="panel-heading">
            <h2>LibTV 工作台</h2>
            <a className="panel-link" href="#connections">
              管理账号 <ArrowUpRight size={14} aria-hidden="true" />
            </a>
          </header>
          {connections.length ? (
            connections.map((account) => (
              <div
                className="overview-row overview-connection"
                key={account.id}
              >
                <span className="row-icon">
                  <Users size={17} aria-hidden="true" />
                </span>
                <span>
                  <strong>{account.alias}</strong>
                  <small>
                    {account.id}
                    {account.diagnosis?.activeSpace
                      ? ` · ${account.diagnosis.activeSpace}`
                      : ""}
                  </small>
                </span>
                <Badge
                  tone={
                    !account.enabled || account.healthStatus === "error"
                      ? "amber"
                      : "neutral"
                  }
                >
                  {!account.enabled
                    ? "已停用"
                    : account.healthStatus === "authenticated" &&
                        account.credentialPresent
                      ? "授权有效"
                      : account.healthStatus === "error"
                        ? "诊断失败"
                        : "待诊断"}
                </Badge>
              </div>
            ))
          ) : (
            <div className="empty">暂无已登记的 LibTV 账号。</div>
          )}
          <div className="overview-links">
            {links
              .filter((link) => link.href !== "#connections")
              .map(({ title, description, href, icon: Icon }) => (
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
          </div>
        </section>
        <section className="panel overview-panel">
          <header className="panel-heading">
            <Terminal size={17} />
            <h2>网关连接</h2>
            <a className="panel-link" href="#gateway">
              查看网关 <ArrowUpRight size={14} aria-hidden="true" />
            </a>
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
