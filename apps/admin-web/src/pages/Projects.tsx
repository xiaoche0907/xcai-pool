import { useState, useEffect } from "react";
import { useInvalidate, useList } from "@refinedev/core";
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
  type ConnectionStatus,
} from "../shared.js";
export default function Projects() {
  const { api, config } = useApp(),
    { busy, run } = useAction(),
    list = useList<any>({ resource: "projects", pagination: { mode: "off" } });
  const invalidate = useInvalidate();
  const accounts = useList<ConnectionStatus>({
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
  const owner = accounts.result.data.find(
    (account) => account.id === selected?.connectionId,
  );
  const visibleId =
    list.query.isSuccess && accounts.query.isSuccess && owner
      ? selected?.id
      : undefined;
  const snapshotRevision = selected?.snapshotAt;
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
  }, [visibleId, snapshotRevision, api]);
  return (
    <>
      <div className="section-title">
        <div>
          <h2>画布档案</h2>
          <p className="muted">按 LibTV 账号查看已登记的画布和节点快照。</p>
        </div>
      </div>
      <ErrorBox error={list.query.error} />
      <ErrorBox error={accounts.query.error} />
      {list.query.isPending || accounts.query.isPending ? (
        <Loading />
      ) : list.query.isSuccess && accounts.query.isSuccess && !hasAccounts ? (
        <div className="panel empty">
          <p>账号池为空，暂无画布。</p>
          {config.role === "admin" && (
            <a className="button" href="#connections">
              前往账号池添加账号
            </a>
          )}
        </div>
      ) : (
        list.query.isSuccess &&
        accounts.query.isSuccess &&
        accounts.result.data.map((account) => {
          const canvases = list.result.data.filter(
            (project) => project.connectionId === account.id,
          );
          return (
            <section
              className="project-account"
              key={account.id}
              aria-label={`${account.alias} · ${account.id}`}
            >
              <header className="section-title">
                <div>
                  <h3>{account.alias}</h3>
                  <small className="muted">
                    <code>{account.id}</code> · {canvases.length} 个画布
                    {!account.enabled && " · 已停用"}
                  </small>
                </div>
                {config.role === "admin" && account.enabled && (
                  <button
                    disabled={busy}
                    onClick={() =>
                      run(async () => {
                        await api("admin/projects/discover", "POST", {
                          connectionId: account.id,
                        });
                        await invalidate({
                          resource: "projects",
                          invalidates: ["list"],
                        });
                      }, `${account.alias}的画布列表已更新`)
                    }
                  >
                    <RefreshCw size={14} /> 查询上游画布列表
                  </button>
                )}
              </header>
              {!canvases.length && (
                <div className="panel empty">此账号暂无画布记录。</div>
              )}
              {canvases.length > 0 && (
                <div className="project-list">
                  {canvases.map((p) => (
                    <button
                      key={p.id}
                      className={
                        selected?.id === p.id ? "project active" : "project"
                      }
                      aria-pressed={selected?.id === p.id}
                      onClick={() => setSelectedId(p.id)}
                    >
                      <Workflow size={23} />
                      <span>
                        <strong>{p.title}</strong>
                        <code>{p.projectUuid}</code>
                        <small>
                          {p.source === "p0-evidence"
                            ? "P0 实测快照"
                            : "上游查询记录"}{" "}
                          · {formatDate(p.lastCheckedAt ?? p.snapshotAt)}
                        </small>
                      </span>
                      <ChevronRight size={17} />
                    </button>
                  ))}
                </div>
              )}
            </section>
          );
        })
      )}
      {visibleId && <ErrorBox error={error} />}
      {visibleId && snapshot?.id !== visibleId && !error && <Loading />}
      {owner && visibleId && snapshot?.id === visibleId && (
        <section className="panel">
          <div className="section-title">
            <div>
              <h2>{selected.title}</h2>
              <p className="muted">
                所属账号 {owner.alias} · <code>{owner.id}</code>
              </p>
              <p className="muted">
                {snapshot.snapshotAt
                  ? `${snapshot.nodes.length} 个节点 · ${snapshot.edges.length} 条边 · 快照于 ${formatDate(snapshot.snapshotAt)}`
                  : "尚未读取节点与连线。"}
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
              {config.role === "admin" && owner.enabled && (
                <button
                  disabled={busy}
                  onClick={() =>
                    run(async () => {
                      await api(
                        `admin/projects/${encodeURIComponent(selected.id)}/refresh`,
                        "POST",
                        {},
                      );
                      await invalidate({
                        resource: "projects",
                        invalidates: ["list"],
                      });
                    }, "上游画布已只读刷新并保存")
                  }
                >
                  <RefreshCw size={14} />
                  只读刷新节点
                </button>
              )}
            </div>
          </div>
          {snapshot.snapshotAt && (
            <>
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
            </>
          )}
        </section>
      )}
    </>
  );
}
