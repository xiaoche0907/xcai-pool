import { useState, useEffect } from "react";
import { useList } from "@refinedev/core";
import Form from "@rjsf/core";
import validator from "@rjsf/validator-ajv8";
import {
  Search,
  RefreshCw,
  Boxes,
  ChevronRight,
  X,
  Check,
  LockKeyhole,
} from "lucide-react";
import {
  useApp,
  useAction,
  Loading,
  ErrorBox,
  Badge,
  formatDate,
} from "../shared.js";
export default function Models() {
  const { api, config, notify } = useApp(),
    { busy, run } = useAction();
  const [type, setType] = useState(""),
    [q, setQ] = useState(""),
    [selected, setSelected] = useState<any>(null),
    [detail, setDetail] = useState<any>(null),
    [mode, setMode] = useState(""),
    [error, setError] = useState<unknown>(null),
    [formData, setFormData] = useState<any>(undefined),
    [receipt, setReceipt] = useState<any>(null),
    [tab, setTab] = useState("form");
  const list = useList<any>({
    resource: "models",
    pagination: { mode: "off" },
    filters: [
      { field: "type", operator: "eq", value: type },
      { field: "q", operator: "contains", value: q },
    ],
  });
  useEffect(() => {
    if (!selected) return;
    let live = true;
    setDetail(null);
    setError(null);
    setFormData(undefined);
    setReceipt(null);
    api(
      `models/${encodeURIComponent(selected.modelKey)}/schema${mode ? "?mode=" + encodeURIComponent(mode) : ""}`,
    )
      .then((d) => {
        if (live) setDetail(d);
      })
      .catch((e) => {
        if (live) setError(e);
      });
    return () => {
      live = false;
    };
  }, [selected, mode, api]);
  const choose = (m: any) => {
    setSelected(m);
    setMode("");
    setTab("form");
  };
  return (
    <>
      <div className="toolbar">
        <div className="tabs">
          {[
            ["", "全部模型"],
            ["image", "图像"],
            ["video", "视频"],
          ].map(([value, label]) => (
            <button
              key={value}
              className={type === value ? "active" : ""}
              onClick={() => setType(value)}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="search">
          <Search size={16} />
          <input
            aria-label="搜索模型"
            placeholder="搜索模型名称或 modelKey"
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
        </div>
        {config.role === "admin" && (
          <>
            <button
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await api("admin/models/import-evidence", "POST", {});
                  await list.query.refetch();
                }, "P0 证据已幂等导入")
              }
            >
              导入 P0 证据
            </button>
            <button
              disabled={busy}
              onClick={() =>
                run(async () => {
                  await api("admin/models/sync", "POST", {});
                  await list.query.refetch();
                }, "在线目录与 Schema 同步完成")
              }
            >
              <RefreshCw size={14} />
              在线同步
            </button>
          </>
        )}
      </div>
      <div className="caption">
        <span>目录已收录 / 生成权限未验证</span>
        <span>{list.result.total ?? "—"} 个模型 · 点击查看参数</span>
      </div>
      <ErrorBox error={list.query.error} />
      {list.query.isPending ? (
        <Loading />
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>模型 / MODEL</th>
                <th>类型</th>
                <th>状态</th>
                <th>Schema</th>
                <th>最近同步</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.result.data.map((m) => (
                <tr key={m.id} onClick={() => choose(m)}>
                  <td>
                    <button
                      className="model-name"
                      onClick={(e) => {
                        e.stopPropagation();
                        choose(m);
                      }}
                    >
                      <span className={`model-icon ${m.modality}`}>
                        <Boxes size={18} />
                      </span>
                      <span>
                        <strong>{m.directoryModelName}</strong>
                        <code>{m.modelKey}</code>
                      </span>
                    </button>
                  </td>
                  <td>{m.modality === "image" ? "图像" : "视频"}</td>
                  <td>
                    <Badge
                      tone={
                        m.availabilityState === "disabled" ? "amber" : "neutral"
                      }
                    >
                      {m.availabilityState === "disabled"
                        ? "已禁用"
                        : m.availabilityState === "listed"
                          ? "目录已收录"
                          : "待重新确认"}
                    </Badge>
                  </td>
                  <td className="mono">
                    v{m.schemaVersion}
                    <small>{m.schemaHash.slice(0, 8)}</small>
                  </td>
                  <td className="muted small">{formatDate(m.lastSyncedAt)}</td>
                  <td>
                    <ChevronRight size={16} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!list.result.data.length && (
            <div className="empty">没有匹配的模型</div>
          )}
        </div>
      )}
      {selected && (
        <div className="drawer-backdrop" onClick={() => setSelected(null)}>
          <aside
            className="drawer"
            aria-label="模型参数详情"
            onClick={(e) => e.stopPropagation()}
          >
            <header>
              <div>
                <span className="eyebrow">MODEL INSPECTOR</span>
                <h2>{selected.directoryModelName}</h2>
                <code>{selected.modelKey}</code>
              </div>
              <button
                className="icon-button"
                aria-label="关闭模型详情"
                onClick={() => setSelected(null)}
              >
                <X size={20} />
              </button>
            </header>
            <div className="drawer-body">
              <Badge>目录已收录 / 生成权限未验证</Badge>
              <div className="tabs detail-tabs">
                {[
                  ["form", "参数表单"],
                  ["schema", "原始 Schema"],
                  ["changes", "变更记录"],
                ].map(([v, label]) => (
                  <button
                    key={v}
                    className={tab === v ? "active" : ""}
                    onClick={() => setTab(v)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <ErrorBox error={error} />
              {!detail && !error && <Loading />}
              {detail && (
                <>
                  {tab === "form" && (
                    <>
                      <label className="field-label">
                        生成模式
                        <select
                          aria-label="生成模式"
                          value={detail.form.mode}
                          onChange={(e) => setMode(e.target.value)}
                        >
                          {detail.form.modes.map((m: string) => (
                            <option key={m}>{m}</option>
                          ))}
                        </select>
                      </label>
                      <p className="hint">
                        仅测试参数结构，不上传素材、不触发生成。参考节点填写
                        key。
                      </p>
                      {!detail.form.canValidate && (
                        <div className="error-box">
                          此模式包含尚未转换的素材类型条件，仅可查看；参数校验已禁用。
                        </div>
                      )}
                      <Form
                        key={detail.form.mode}
                        schema={detail.form.jsonSchema}
                        validator={validator}
                        customValidate={(data, errors) => {
                          const result = validator.validateFormData(
                            data,
                            detail.form.validationSchema,
                          );
                          for (const e of result.errors)
                            errors.addError(e.stack);
                          return errors;
                        }}
                        uiSchema={{
                          prompt: { "ui:widget": "textarea" },
                          "ui:submitButtonOptions": { norender: true },
                        }}
                        formData={formData}
                        onChange={(e) => setFormData(e.formData)}
                        onSubmit={(e) =>
                          run(async () => {
                            const result = await api(
                              `models/${selected.modelKey}/validate`,
                              "POST",
                              {
                                modeType: detail.form.mode,
                                parameters: e.formData,
                              },
                            );
                            setReceipt(result);
                          }, "服务器参数校验通过；未执行生成")
                        }
                        noHtml5Validate
                      >
                        <div className="form-actions">
                          <button
                            type="submit"
                            className="primary"
                            disabled={
                              busy ||
                              selected.availabilityState !== "listed" ||
                              !detail.form.canValidate
                            }
                          >
                            <Check size={15} />
                            服务端校验参数
                          </button>
                          <button type="button" disabled>
                            <LockKeyhole size={14} />
                            生成已关闭
                          </button>
                        </div>
                      </Form>
                      {receipt && (
                        <div className="success" role="status">
                          参数校验通过 · 上游生成权限与素材语义未验证 ·
                          generation_enabled=false
                        </div>
                      )}
                      <details className="conversion">
                        <summary>
                          转换说明 · {detail.form.warnings.length}{" "}
                          项只读能力/限制
                        </summary>
                        <ul>
                          {detail.form.warnings.map((w: string) => (
                            <li key={w}>{w}</li>
                          ))}
                        </ul>
                      </details>
                    </>
                  )}
                  {tab === "schema" && (
                    <>
                      <p className="hint">
                        完整原始 Schema · Schema 名称可能与目录名称不同
                      </p>
                      <pre>{JSON.stringify(detail.rawSchema, null, 2)}</pre>
                    </>
                  )}
                  {tab === "changes" && (
                    <>
                      <dl>
                        <dt>当前版本</dt>
                        <dd>v{detail.schemaVersion}</dd>
                        <dt>SHA256</dt>
                        <dd className="break mono">{detail.schemaHash}</dd>
                      </dl>
                      <h3>变更路径</h3>
                      {detail.changes.length ? (
                        <pre>{JSON.stringify(detail.changes, null, 2)}</pre>
                      ) : (
                        <p className="muted">尚无 Schema 内容变更记录。</p>
                      )}
                      {detail.previousSchema && (
                        <details>
                          <summary>前一版本原文</summary>
                          <pre>
                            {JSON.stringify(detail.previousSchema, null, 2)}
                          </pre>
                        </details>
                      )}
                    </>
                  )}
                  {config.role === "admin" && (
                    <div className="danger-zone">
                      <button
                        disabled={busy}
                        onClick={() =>
                          run(async () => {
                            await api(
                              `admin/models/${selected.modelKey}`,
                              "PATCH",
                              {
                                disabled:
                                  selected.availabilityState !== "disabled",
                              },
                            );
                            setSelected(null);
                            await list.query.refetch();
                            notify("重新启用后需在线同步确认收录状态");
                          }, "模型状态已更新")
                        }
                      >
                        {selected.availabilityState === "disabled"
                          ? "解除手动禁用"
                          : "禁用此模型"}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
