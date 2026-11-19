import { useState, useEffect } from "react";
import { useList } from "@refinedev/core";
import {
  RefreshCw,
  Workflow,
  ChevronRight,
  ArrowUpRight,
  ArrowRight,
} from "lucide-react";
import {
  useApp,
  useAction,
  Loading,
  ErrorBox,
  Badge,
  formatDate,
} from "../shared.js";
export default function Projects() {
  const { api, config } = useApp(),
    { busy, run } = useAction(),
    list = useList<any>({ resource: "projects", pagination: { mode: "off" } });
  const accounts = useList<{ id: string; enabled: boolean }>({
    resource: "connections",
    pagination: { mode: "off" },
  });
  const hasAccounts = accounts.result.data.length > 0;
  const [selectedId, setSelectedId] = useState<string | null>(null),
    [snapshot, setSnapshot] = useState<any>(null),
    [error, setError] = useState<unknown>(null);
  const selected = list.result.data.find(
    (project) => project.id === selectedId,
  );
  const visibleId = selected?.id;
  useEffect(() => {
    setSnapshot(null);
    setError(null);
    if (!visibleId) return;
    let live = true;
    api(`projects/${encodeURIComponent(visibleId)}/nodes`)
      .then((d) => {
        if (live) setSnapshot(d);
      })
      .catch((e) => {
        if (live) setError(e);
      });
    return () => {
      live = false;
    };
  }, [visibleId, api]);
  return (
    <>
      <div className="section-title">
        <div>
          <h2>画布档案</h2>
          <p className="muted">读取上游已有画布，不创建、不修改节点与连线。</p>
        </div>
        {config.role === "admin" &&
          accounts.result.data.some((account) => account.enabled) && (
            <button
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await api("admin/projects/discover", "POST", {});
                  await list.query.refetch();
                }, "个人根空间画布已查询并登记")
              }
            >
              <RefreshCw size={14} />
              查询上游画布列表
            </button>
          )}
      </div>
      <ErrorBox error={list.query.error} />
      <ErrorBox error={accounts.query.error} />
      {list.query.isPending || accounts.query.isPending ? (
        <Loading />
      ) : list.query.isSuccess &&
        accounts.query.isSuccess &&
        list.result.data.length === 0 ? (
        <div className="panel empty">
          <p>{hasAccounts ? "暂无画布记录。" : "账号池为空，暂无画布。"}</p>
          {!hasAccounts && config.role === "admin" && (
            <a className="button" href="#connections">
              前往账号池添加账号
            </a>
          )}
        </div>
      ) : (
        <div className="project-list">
          {list.result.data.map((p) => (
            <button
              key={p.id}
              className={selected?.id === p.id ? "project active" : "project"}
              onClick={() => setSelectedId(p.id)}
            >
              <Workflow size={23} />
              <span>
                <strong>{p.title}</strong>
                <code>{p.projectUuid}</code>
                <small>
                  {p.source === "p0-evidence" ? "P0 实测快照" : "上游查询记录"}{" "}
                  · {formatDate(p.lastCheckedAt ?? p.snapshotAt)}
                </small>
              </span>
              <ChevronRight size={17} />
            </button>
          ))}
        </div>
      )}
      <ErrorBox error={error} />
      {selected && !snapshot && !error && <Loading />}
      {selected && snapshot && (
        <section className="panel">
          <div className="section-title">
            <div>
              <h2>{selected.title}</h2>
              <p className="muted">
                {snapshot.nodes.length} 个节点 · {snapshot.edges.length} 条边 ·{" "}
                {snapshot.source === "upstream"
                  ? "实时读取后入库"
                  : "P0 证据快照"}
              </p>
            </div>
            <div className="actions">
              <a
                className="button"
                href={selected.canvasUrl}
                target="_blank"
                rel="noreferrer"
              >
                官方画布
                <ArrowUpRight size={14} />
              </a>
              {config.role === "admin" && (
                <button
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      setSnapshot(
                        await api(
                          `admin/projects/${encodeURIComponent(selected.id)}/refresh`,
                          "POST",
                          {},
                        ),
                      );
                      await list.query.refetch();
                    }, "上游画布已只读刷新并保存")
                  }
                >
                  <RefreshCw size={14} />
                  只读刷新节点
                </button>
              )}
            </div>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>节点名称</th>
                  <th>nodeKey</th>
                  <th>类型</th>
                </tr>
              </thead>
              <tbody>
                {snapshot.nodes.map((n: any) => (
                  <tr key={n.nodeKey}>
                    <td>{n.displayName}</td>
                    <td className="mono">{n.nodeKey}</td>
                    <td>
                      <Badge>{n.nodeType}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <h3>参考连接</h3>
          <div className="edges">
            {snapshot.edges.map((e: any) => (
              <div key={e.id}>
                <code>{e.source}</code>
                <ArrowRight size={16} />
                <code>{e.target}</code>
              </div>
            ))}
            {!snapshot.edges.length && (
              <p className="muted">该快照没有连接记录。</p>
            )}
          </div>
        </section>
      )}
    </>
  );
}
