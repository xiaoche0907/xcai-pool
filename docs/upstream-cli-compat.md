# CLI 1.2.0 兼容性

P0 原记录完整保留于 `docs/p0`。本轮没有执行旧 probe、重放标记、升级二进制或官方登录/登出。新 Adapter 显式限定 Windows 本地已验证版本，生产 Linux 支持尚未验证。

| P0 实测差异 | P1-A 处理 | 验证 |
|---|---|---|
| modelKey / 目录 modelName / Schema 内名字可能不同 | 全量保留；序列化预览使用目录 modelName | 单元 + API + 浏览器 |
| `settings.quality` 被拒绝 | 统一 `-s settings=<JSON>`，不让 UI 拼参数 | 单元 + API；未执行节点配置 |
| 创建画布是 `projectMeta.uuid` | 命令级转换器保留此形状 | P0 记录 + 单元；本期没有创建画布 |
| 节点创建是 nodeKey 或 newNodeKey | 转换器同时保留 connections/reactFlowNode | P0 记录 + 单元；本期没有创建节点 |
| `node --run` 阻塞到终态 | 本期方法和进程白名单均禁止；不解析 stderr taskId 充当成功 | 双层拒绝测试；长任务成功仍未验证 |
| 下载要求会员态一致的 watermark | 本期无下载 API，不假装生成输出可下载 | 原 P0 证据保留 |
| account use 是个人/团队空间切换 | 无该命令入口；只接原 account-01 | 账号 API 诊断成功 |
| account list、project list | 从官方 CLI 枚举团队；在无工作区绑定的临时目录按个人和团队空间分页读取画布 | 已安装版帮助、P0 个人列表样例、分页和多空间测试。当前本地账号池为空，未直连团队验证 |
| project 查询返回 nodes/edges | node id -> nodeKey，字段归一化后事务保存本地 | 真实 5 节点/2 边 + 集成 |
| 查询可返回 NDJSON | 受控 JSON/NDJSON 解析，失败明确报错 | 单元 |
| 1200000138 | 映射 LIBTV_GALLERY_CAPACITY_BLOCKED，保留原失败审计 | 单元 + P0 导入 |

每次连接适配器使用前核验 `--version`。仅允许环境白名单，设置该账号的原始 LIBTV_CONFIG_DIR 与工作目录；不继承 LIBTV_TOKEN/DEBUG/自定义登录 URL。进程限时只用于**只读**查询，stdout 8 MB / stderr 1 MB 上限；未来生成不能照搬此查询超时策略。

本服务审计记录参数数组、PID、退出码、耗时与脱敏错误，不持久化完整 stdout。所有请求经官方 CLI 完成，未拼造画布私有 HTTP 接口。
