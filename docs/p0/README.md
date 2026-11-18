# FramePool / LibTV P0 实测报告

日期：2026-11-18（Asia/Shanghai）。状态：**部分验证通过，生成闭环被图库容量阻断；用户选择保留当前记录。** P1/P2 尚未实施。

## 环境与来源

- 初始工作目录为空，且不是 Git 仓库；没有发现既有境彻代码，没有修改其他项目。
- Windows x64，Node v24.12.0；PATH 与默认安装目录均未发现 LibTV CLI。
- 从官方 activity 渠道取得版本 **1.2.0** 和安装脚本地址，下载并检查脚本后，按脚本的平台包地址安装到本项目 `.local/libtv-p0/bin/libtv-win-x64/libtv.exe`。未执行远端脚本、未修改全局 PATH。
- 二进制无 Authenticode 签名；来源通过官方 HTTPS 渠道核对，SHA256 作为本次下载指纹保存，未获得可独立校验的官方签名或校验清单。
- [发布入口返回](evidence/release.json)、[安装来源/哈希/运行环境](evidence/installation.json)、[CLI 完整帮助](evidence/help.json)、[版本返回](evidence/version.json)。

参考来源：[安装](https://github.com/liminjun813/xinyuan-agent-skills/blob/main/libtv-cli/scripts/install.md)、[模型](https://github.com/liminjun813/xinyuan-agent-skills/blob/main/libtv-cli/commands/model.md)、[节点](https://github.com/liminjun813/xinyuan-agent-skills/blob/main/libtv-cli/commands/node.md)、[账号](https://github.com/liminjun813/xinyuan-agent-skills/blob/main/libtv-cli/commands/account.md)。运行约定以本次安装版本的帮助和返回为准。

## 实测结论

| 项目 | 结果 | 证据 |
| --- | --- | --- |
| CLI 安装、版本、帮助 | 通过；12 组版本/帮助命令退出码均为 0 | `evidence/*help.json`、`version.json` |
| 独立目录登录 | 官方 `login web --open` 返回成功，凭据只保留在本地私有目录 | `tools/libtv-p0/login.ps1` |
| 登录验证 | 登录前 401，官方登录后 `account info` 退出 0 | `account-info-before-login.json`、`account-info.json` |
| 图像模型检索 | 返回 27 个目录条目 | [实际模型列表](models.md)、`models-image.json` |
| 视频模型检索 | 返回 38 个目录条目 | [实际模型列表](models.md)、`models-video.json` |
| 完整 Schema | 对全部 65 个 modelKey 逐一调用，均退出 0；完整返回已保存 | `schemas/<modelKey>.json`、`evidence/schema-<modelKey>.json` |
| 创建、绑定测试画布 | 通过，个人空间，根工作区 | `project-create.json`、`project-find.json`、`project-bind.json` |
| 文生图节点配置 | 通过；Z-image Turbo，1 张，1K，1:1 | `image-create-v2.json` |
| 文生图执行 | **失败**；服务端返回 1200000138，图库空间不足 | `image-run.json` |
| 文生视频节点配置 | 通过；Wan 2.2，1 条，480P，5 秒，16:9 | `video-create.json` |
| 文生视频执行 | **失败**；服务端返回相同容量错误 | `video-run.json` |
| 参考图上传与连线 | 通过；本地白底红圆 PNG 测试素材上传，并分别连接到图像和视频节点 | `reference-upload.json`、`reference-image-create.json`、`reference-video-create.json` |
| CLI 资源下载 | 已下载上传的参考图，属于上传资源下载验证 | `reference-download.json`、`reference-files.json` |
| 参考图生成结果 | **未验证**；已知容量阻断后未继续提交 | 参考节点当前没有生成结果 |
| 画布可追溯 | 5 个节点、2 条参考边 | `canvas-snapshot.json` |
| 本地重复提交保护 | 新进程使用同一操作名时，由持久化标记在启动 CLI 前拒绝，原标记未变化 | `replay-guard.json` |
| 两个配置目录隔离 | account-02 空目录返回未登录，account-01 仍验证成功 | `isolation.json`、`account-02-account-info.json` |

这里的模型数量是 supportModels 目录条目数，不是账号已获生成授权的模型数量。第二个真实登录用户尚未接入；空目录探测不能替代双账号验收。没有成功提交返回的 taskId，也没有生成图片或视频文件；本地上传素材与下载副本均不是生成结果。无法仅凭创建失败日志判断平台实际扣费情况。

## 画布与节点

[打开测试画布](https://www.liblib.tv/canvas?projectId=073cb4165ec54d29b24fef3254c05e54)

`projectUuid`: `073cb4165ec54d29b24fef3254c05e54`

| nodeKey | 名称 | 用途 |
| --- | --- | --- |
| `i-W7c1qvR4tq` | P0-text-image | 文生图，执行被容量拒绝 |
| `v-Xbws4VQ2CW` | P0-text-video | 文生视频，执行被容量拒绝 |
| `i-0CCcDTyZXJ` | P0-reference-red-circle | 上传的 256×256 白底红圆测试图 |
| `i-oeR3ckBZ6a` | P0-reference-image | Seedream 4.0 图生图，已接参考边，未执行 |
| `v-IWgjxJiVvS` | P0-reference-video | Wan 2.2 首帧图生视频，已接参考边，未执行 |

图像失败 logId：`3fbdcf75-9072-4b38-9ed0-51524ff13331`。
视频失败 logId：`a09a976c-4afc-4ae1-9856-02b3c74c6545`。

## 已确认的 CLI 差异与边界

1. `libtv model <modelKey>` 查询 Schema 使用 key；节点 `-s model=...` 只接受目录中的 **modelName**。查询的顶层 modelName 可能仍是输入 key；不能直接用它配置节点。例如 z-image 的目录展示名为 `Z-image Turbo`，schema 内则为 `Z Image`。
2. 当前帮助提到 `settings.*`，但实测 `-s settings.quality=1K` 被判未知顶层字段，未创建节点。随后查询空节点列表确认，再以不同操作记录使用 `-s 'settings={"quality":"1K","ratio":"1:1"}'`，配置成功。这是参数校验失败后的修正，没有重试扣费生成。
3. `node --run` 是阻塞到终态的长命令；不能见到进度 taskId 就认为成功，也不应自行设置生成超时或额外轮询。本次生成因服务端拒绝而快速退出，尚未实测成功长任务生命周期。
4. 创建节点的输出形状不同：单独创建返回 `nodeKey`；带参考连线时返回 `newNodeKey`、`connections`、`reactFlowNode`。不能固定只解析一种输出。
5. `project create` 实际返回 `projectMeta.uuid`，并非文档示例的根级 `uuid`。早期脱敏记录把 uuid 隐去了；后续通过精确名称查询（只有 1 条命中）恢复可追溯关联，未重复创建画布。
6. `download --watermark <true|false>` 为必填，会员态由服务端校验。当前账号 `memberAccount.effective=false`，`--watermark true` 实际下载成功。
7. `account info` 中的个人/团队空间属于同一登录用户，不能视为独立账号。实测当前 activeAccount 为个人空间，未调用 `account use` 切换团队。
8. 空间不足时上传参考资源仍可成功，但生成接口失败；上传成功不能替代生成健康检查。只通过 CLI 操作画布，没有自行构造私有画布 HTTP 请求。

## 本地工具与敏感数据边界

- 登录：`powershell -NoProfile -File .\tools\libtv-p0\login.ps1`。登录流程交由官方网页，不读取浏览器 Cookie、不绕过验证码。
- 只读探测：`node tools/libtv-p0/probe.mjs help` / `account` / `catalog` / `schema <modelKey>` / `schemas`。
- 精确执行并记录：`node tools/libtv-p0/probe.mjs execute <操作名> '<JSON参数数组>'`，只允许 project/node/upload/download。该工具用于 P0 本地验证，不是生产 Adapter/API。
- 子进程使用参数数组、`shell:false`、独立 cwd/config，清除继承的 `LIBTV_TOKEN` 和调试/登录地址覆盖变量。返回记录包含起止时间、参数、PID、退出码、stdout/stderr；不保存凭据原文。
- account-01/account-02 配置与工作目录分别位于 `.local/libtv-p0/accounts/<account>/config` 和 `work`。本次已移除账号目录继承权限，仅当前 Windows 用户和 SYSTEM 有完全权限。同一 Windows 用户仍可访问两个目录，不等于生产 OS 用户/容器隔离。
- `.local/`（二进制、凭据、绑定、提交标记、素材、结果）被 `.gitignore` 排除。可共享 evidence 已遮盖用户标识、身份字段、媒体 URL 中的用户路径。画布 UUID 和 nodeKey 保留用于追溯。
- `create` / `upload` / `--run` 在启动前用独占写入创建操作标记；已存在则不启动 CLI。非零退出保留为待核对，不自动重试。本次重新启动脚本的保护已验证，BullMQ/数据库恢复仍属 P1，尚未实现。

## 恢复验收条件

用户已选择先保留记录，当前不再提交生成。待用户确认官方图库容量已处理后：先核对现有节点、平台任务和扣费记录，再显式创建新的测试尝试记录；不要删除旧提交标记来盲重放。

恢复后需要分别完成文生图、文生视频、参考图生成（图像/视频），等待 CLI 终态、查询节点结果并下载实际生成文件，验证媒体可读、记录大小/哈希、回查画布。然后才能宣告 P0 生成闭环通过。图生图可在执行前明确关闭组图模式，以保持单次输出范围。P1 的 Fastify/Drizzle/BullMQ/后台与 P2 的真实双账号隔离和调度均未开始。
