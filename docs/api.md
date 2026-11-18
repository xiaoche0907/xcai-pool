# P1-A API 合约

前缀 `/api/v1`。所有 API 都要求 `Authorization: Bearer <key>`。密钥来自本地 `.env`，后台只在标签页的会话存储中保存已验证的密钥。管理员和只读密钥各自独立，管理员接口要求 admin 权限。

## 接入 XcAIPool 网关

参考 [Magpie 的本地网关设计](https://github.com/yetone/magpie#how-it-fits-together)，调用方只需配置网关地址和网关密钥。LibTV 的官方登录由 XcAIPool 管理。查询模型目录时可使用 `.env` 中的 `VIEWER_API_KEY`。

| 配置项 | 本机配置 |
|---|---|
| Base URL | `http://127.0.0.1:51667/api/v1`（端口以 `.env` 为准） |
| 认证 | `Authorization: Bearer <VIEWER_API_KEY>` |
| 连通检查 | `GET /config` |
| 图像、视频模型 | `GET /models?type=image`、`GET /models?type=video` |
| 模型标识 | 使用目录返回的 `modelKey`，例如 `z-image` |

使用支持自定义 HTTP 请求的客户端。当前网关提供 XcAIPool 自有接口，不能直接填入只支持 OpenAI 协议的客户端。`GET /config` 返回 `generationEnabled=false` 时，模型目录和参数校验仍可使用。

| 方法 | 路径 | 权限 | 行为 |
|---|---|---|---|
| GET | `/config` | viewer/admin | 阶段、角色、CLI 约束、generationEnabled=false |
| GET | `/models?type=image\|video&q=...` | viewer/admin | PostgreSQL 模型目录，`{data,total}` |
| GET | `/models/:modelKey/schema?mode=...` | viewer/admin | 原始/前一版 Schema、版本、哈希、变更路径、RJSF 字段树、完整校验 Schema、转换警告 |
| GET | `/models/:modelKey/route-preview` | viewer/admin | 用各账号的 CLI 配置查询登录和目录可见性，保留生成权限未验证状态 |
| POST | `/models/:modelKey/validate` | viewer/admin | 严格参数校验，不运行 CLI，不生成 |
| GET | `/connections` | viewer/admin | 脱敏连接 DTO，不暴露凭据内容/路径 |
| GET | `/projects` | viewer/admin | 本地登记画布、上游链接与数据来源/时间 |
| GET | `/projects/:id/nodes` | viewer/admin | DB 快照节点和边；id 是本地标识，非 UUID |
| POST | `/admin/models/import-evidence` | admin | 显式幂等导入现有 P0 证据 |
| POST | `/admin/models/sync` | admin | CLI 只读同步，单进程内防重复同步 |
| PATCH | `/admin/models/:modelKey` | admin | `{disabled:boolean}`，解除禁用后须同步 |
| PATCH | `/admin/connections/:id` | admin | `{alias?:string, enabled?:boolean}`，禁止任意路径或凭据字段 |
| POST | `/admin/connections/:id/diagnose` | admin | CLI 版本核验和账号诊断，保留原配置 |
| POST | `/admin/projects/discover` | admin | 查询个人根空间列表并登记本地 DB |
| POST | `/admin/projects/:id/refresh` | admin | 上游只读刷新本地节点/边快照 |
| GET | `/admin/audit-events` | admin | 最近 200 条脱敏 DB 审计 |
| POST | `/tasks` | viewer/admin | 403 GENERATION_DISABLED，包含 mock 请求也不执行 |
| GET | `/tasks`、`/tasks/:id` | viewer/admin | 查询已导入的生成尝试及详情；使用本地记录 ID |
| GET/POST | `/admin/connections/login` | admin | 查看或启动新账号的官方本机网页登录 |
| POST | `/admin/connections/login/open-browser` | admin / 本机 | 在 Windows 上为当前有效授权链接打开独立浏览器窗口 |
| POST | `/admin/connections/login/phone` | admin | `{phone}` 申请官方短信，`{phone,code}` 验证。触发人机校验时转到官方网页 |
| POST | `/admin/connections/register` | admin | 核验授权并登记新账号，接受可选的 `alias` |

无 body 的 POST 只接受 `{}` 或不传 body。导入/同步接口不接受客户端任意文件路径、CLI 参数、凭据或 URL。模型查询与参数请求为严格 Zod 校验，核心读取响应在发送前按 DTO 再校验。

示例参数验证 body（节点模型名称由服务器从目录取得）：

```json
{"modeType":"text2image","parameters":{"prompt":"A red ceramic teapot","count":1,"settings":{"quality":"1K","ratio":"1:1"}}}
```

成功返回 `valid=true, generationEnabled=false, upstreamValidated=false`、转换警告及服务器序列化预览。预览不代表执行。未知顶层/嵌套字段、非法模式/枚举/边界返回 422；停用/未收录模型返回 409。

统一错误：`{"error":{"code":"...","message":"...","requestId":"...","details":[]}}`。未授权 401、非管理员 403、参数请求格式错误 400、资源不存在 404、Schema 不支持/参数不合法 422、CLI 查询失败 502、版本不符 503。细节不回显原始请求/凭据。
