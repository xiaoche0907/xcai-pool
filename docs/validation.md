# P1-A 验证方法

自动化测试基于真实 P0 证据进行 Schema/字段差异检查；API 集成使用真实 PostgreSQL 与 Drizzle。单元/集成中的 CLI 响应替身仅用于验证错误、模式、同步和拒绝分支，不作为页面数据源，也不声称真实生成。

- 单元：65 Schema 的全部 209 模式可编译、枚举、嵌套字段、未知字段拒绝、提示词、数值边界、模式/参考数量、无法支持规则的显式拒绝、名称/JSON 设置序列化、创建返回兼容、NDJSON/畸形响应、日志脱敏、生成/写命令白名单拒绝。
- 集成：真实本地测试数据库，迁移/幂等导入、27/38 分类、搜索、参数二次校验、账号别名/停用、模型禁用/下架/变更、画布 5 节点/2 边持久化、鉴权、审计、generation true 拒绝启动、任务请求不调用 CLI。
- 真实只读冒烟：`tools/p1/live-smoke.ts` 对正在运行的 Fastify 调用账号诊断、65 模型在线同步、目录/Schema、上游画布列表与节点刷新、生成硬拦截及日志读取。
- 浏览器：Playwright 使用本机 Edge，真实登录管理员 API、搜索模型、RJSF 枚举选择与服务器校验、完整 Schema、账号/画布/审计页面、390px 无整页横向溢出。抓取页面异常和 API 非 2xx，任何一项使检查失败。
- 保护性验证：189 个既有 P0 文件 SHA256 前后比对，包含 binary/zip、凭据、绑定和提交标记；哈希本体只在 `.local/framepool-p1/p0-baseline.json`，共享报告不含密钥。
- 初始化保护：Windows PowerShell 实际执行首次初始化脚本，在已有 `.env` 时明确拒绝；前后环境文件哈希一致，见 `p1/setup-guard.json`。
- 密钥泄漏检查：扫描源码、文档、工具和构建产物，不包含当前管理员/只读密钥或数据库密码原文，见 `p1/secret-scan.json`；检查不输出密钥值。

记录：`docs/p1/test-results.json`、`live-smoke.json`、`browser-checks.json`、`preservation.json`、`safety-summary.json`、`dependencies.json` 与 `screenshots/`。截图中没有密钥或登录凭据。

本轮没有测试生成输出、长时间生成成功生命周期、P1-B 队列恢复、双真实账号或生产部署。完整依赖 audit 的开发工具漏洞如实保留在验收报告中。
