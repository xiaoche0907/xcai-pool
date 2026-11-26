import { useList } from "@refinedev/core";
import { RefreshCw } from "lucide-react";
import { Loading, ErrorBox, formatDate } from "../shared.js";
export default function Logs() {
  const list = useList<any>({
    resource: "admin/audit-events",
    pagination: { mode: "off" },
  });
  return (
    <>
      <div className="section-title">
        <div>
          <h2>可追溯操作</h2>
          <p className="muted">
            数据库审计 · 最近 200 条 · 不记录访问密钥或原始凭据
          </p>
        </div>
        <button
          disabled={list.query.isFetching}
          onClick={() => void list.query.refetch()}
        >
          <RefreshCw size={14} />
          刷新
        </button>
      </div>
      <ErrorBox error={list.query.error} />
      {list.query.isPending ? (
        <Loading />
      ) : (
        list.query.isSuccess && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>时间</th>
                  <th>操作</th>
                  <th>对象</th>
                  <th>详情</th>
                </tr>
              </thead>
              <tbody>
                {!list.result.data.length && (
                  <tr>
                    <td colSpan={4}>暂无审计记录。</td>
                  </tr>
                )}
                {list.result.data.map((e) => (
                  <tr key={e.id}>
                    <td className="small muted">{formatDate(e.createdAt)}</td>
                    <td>
                      <strong className="mono small">{e.action}</strong>
                      <small>{e.actorId}</small>
                    </td>
                    <td className="mono small">{e.entityId}</td>
                    <td>
                      <details>
                        <summary>脱敏元数据</summary>
                        <pre>{JSON.stringify(e.redactedMetadata, null, 2)}</pre>
                      </details>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </>
  );
}
