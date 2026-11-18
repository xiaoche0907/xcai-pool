import { useEffect, useRef, useState } from "react";
import { useList } from "@refinedev/core";
import { ArrowUpRight, Copy, RefreshCw, X } from "lucide-react";
import {
  Badge,
  ErrorBox,
  Loading,
  formatDate,
  useAction,
  useApp,
} from "../shared.js";

type Attempt = {
  connectionId: string;
  startedAt: string | null;
  finishedAt: string;
  status: "failed";
  exitCode: number | null;
  errorCode: string;
};
type Task = {
  id: string;
  upstreamTaskId: string | null;
  provider: string;
  status: "failed";
  phase: "submission_rejected";
  modelName: string | null;
  connectionId: string;
  projectUuid: string | null;
  nodeKey: string;
  startedAt: string | null;
  finishedAt: string;
  errorCode: string;
  errorMessage: string;
  resultUrl: string | null;
  attempts: Attempt[];
};

function TaskDetails({ initial, close }: { initial: Task; close: () => void }) {
  const { api, notify } = useApp();
  const { busy, run } = useAction();
  const dialog = useRef<HTMLDialogElement>(null);
  const [task, setTask] = useState(initial);
  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  return (
    <dialog
      ref={dialog}
      className="workbench-dialog task-dialog"
      aria-labelledby="task-detail-title"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <header className="dialog-heading">
        <div>
          <h2 id="task-detail-title">任务详情</h2>
          <p>刷新只读取原记录，提交账号保持绑定。</p>
        </div>
        <button
          className="icon-button"
          aria-label="关闭任务详情"
          onClick={close}
        >
          <X size={18} />
        </button>
      </header>
      <div className="dialog-body">
        <div className="task-detail-toolbar">
          <code>{task.id}</code>
          <button
            disabled={busy}
            onClick={() =>
              void run(
                async () =>
                  setTask(
                    await api<Task>(`tasks/${encodeURIComponent(task.id)}`),
                  ),
                "任务详情已刷新",
              )
            }
          >
            <RefreshCw size={14} />
            刷新详情
          </button>
        </div>
        <dl className="dialog-fields task-fields">
          <div>
            <dt>任务状态 / 执行阶段</dt>
            <dd>
              <Badge tone="amber">失败</Badge> <span>提交被拒绝</span>
            </dd>
          </div>
          <div>
            <dt>模型 / 提供方</dt>
            <dd>
              {task.modelName ?? "未记录"} / {task.provider}
            </dd>
          </div>
          <div>
            <dt>绑定账号</dt>
            <dd>
              <code>{task.connectionId}</code>
            </dd>
          </div>
          <div>
            <dt>画布节点</dt>
            <dd>
              <code>{task.nodeKey}</code>
            </dd>
          </div>
          <div>
            <dt>开始时间</dt>
            <dd>{task.startedAt ? formatDate(task.startedAt) : "未记录"}</dd>
          </div>
          <div>
            <dt>结束时间</dt>
            <dd>{formatDate(task.finishedAt)}</dd>
          </div>
          <div>
            <dt>上游任务 ID</dt>
            <dd>{task.upstreamTaskId ?? "未收到上游任务 ID"}</dd>
          </div>
        </dl>
        <button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(task.id);
              notify("已复制任务记录 ID");
            } catch {
              notify("无法访问剪贴板，请手动复制", true);
            }
          }}
        >
          <Copy size={14} />
          复制任务记录 ID
        </button>
        <h3>错误信息</h3>
        <div className="dialog-status">
          <strong>{task.errorMessage}</strong>
          <br />
          <code>{task.errorCode}</code>
        </div>
        <h3>生成结果</h3>
        {task.resultUrl ? (
          <a href={task.resultUrl} target="_blank" rel="noreferrer">
            打开生成结果
          </a>
        ) : (
          <p className="muted">此次尝试没有生成输出。</p>
        )}
        {task.projectUuid && (
          <a
            className="button"
            href={`https://www.liblib.tv/canvas?projectId=${encodeURIComponent(task.projectUuid)}`}
            target="_blank"
            rel="noreferrer"
          >
            打开所属画布 <ArrowUpRight size={14} />
          </a>
        )}
        <h3>执行尝试</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>时间</th>
                <th>账号</th>
                <th>结果</th>
              </tr>
            </thead>
            <tbody>
              {task.attempts.map((attempt, index) => (
                <tr key={index}>
                  <td>{formatDate(attempt.startedAt ?? attempt.finishedAt)}</td>
                  <td>
                    <code>{attempt.connectionId}</code>
                  </td>
                  <td>失败 · 退出码 {attempt.exitCode ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <details className="task-json">
          <summary>查看脱敏尝试记录 JSON</summary>
          <pre>{JSON.stringify(task.attempts, null, 2)}</pre>
        </details>
      </div>
      <footer className="dialog-actions">
        <button onClick={close}>关闭详情</button>
      </footer>
    </dialog>
  );
}

export default function Tasks() {
  const { result, query } = useList<Task>({
    resource: "tasks",
    pagination: { mode: "off" },
  });
  const [selected, setSelected] = useState<Task | null>(null);
  return (
    <>
      <div className="section-title">
        <h2>生成尝试记录</h2>
        <button
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
        >
          <RefreshCw size={15} />
          刷新记录
        </button>
      </div>
      <ErrorBox error={query.error} />
      {query.isPending ? (
        <Loading />
      ) : (
        !query.isError && (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>任务记录 / 模型</th>
                  <th>账号</th>
                  <th>状态</th>
                  <th>结束时间</th>
                  <th>操作</th>
                </tr>
              </thead>
              <tbody>
                {result.data.map((task) => (
                  <tr key={task.id}>
                    <td>
                      <strong>{task.modelName ?? task.provider}</strong>
                      <small>{task.id}</small>
                    </td>
                    <td>
                      <code>{task.connectionId}</code>
                    </td>
                    <td>
                      <Badge tone="amber">提交失败</Badge>
                    </td>
                    <td>{formatDate(task.finishedAt)}</td>
                    <td>
                      <button
                        aria-label={`查看详情 ${task.id}`}
                        onClick={() => setSelected(task)}
                      >
                        查看详情
                      </button>
                    </td>
                  </tr>
                ))}
                {!result.data.length && (
                  <tr>
                    <td colSpan={5}>暂无生成尝试记录。</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )
      )}
      {selected && (
        <TaskDetails
          key={selected.id}
          initial={selected}
          close={() => setSelected(null)}
        />
      )}
    </>
  );
}
