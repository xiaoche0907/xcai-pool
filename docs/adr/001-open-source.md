# ADR 001：只集成本阶段所需开源包

状态：已实施，2026-11-18。实际版本、许可证、源仓库见 [29 个直接依赖清单](../p1/dependencies.md) 和 [机器记录](../p1/dependencies.json)，锁文件是解析版本依据。

| 组件 | 决策 / 用途 | 许可证 | 维护证据 |
|---|---|---|---|
| Refine core 5.0.12 | 已集成；DataProvider、useList、React Query 数据缓存；自有品牌页面 | MIT | npm 元数据 modified 2026-04-20；当前官方 v5 文档 |
| RJSF core/utils/validator-ajv8 6.11.1 | 已集成；JSON Schema 动态表单与 AJV 校验，不重做表单引擎 | Apache-2.0 | npm modified 2026-11-05 |
| Drizzle ORM 0.45.4 / kit 0.31.11 | 已集成；PostgreSQL 表和可追溯迁移 | Apache-2.0 | ORM npm modified 2026-10-21 |
| Fastify 5.12.8 | 已集成；独立 API、受保护静态后台 | MIT | npm modified 2026-11-02 |
| BullMQ 6.7.7（评估时版本） | P1-B 再引入；P1-A 没有队列，不安装 | MIT | npm modified 2026-11-17 |
| Bull Board API 9.13.2（评估时版本） | P1-B 再引入；需独立管理员鉴权，不安装空监控面板 | MIT | npm modified 2026-11-16 |

维护时间取本轮 npm registry 实际查询，不等同安全保证。没有复制整套第三方项目、模板或 AGPL 实现。dola-pool/new-api 只作为 PRD 中概念参考，未拉取源码、未引入其代码或账号采集逻辑；new-api 的 AGPL 边界按 PRD 保留。

## 安全检查

初次 `pnpm audit` 检出 @fastify/static、glob/minimatch、旧 esbuild 和开发工具 picomatch。将 static 升级至 10.1.11（修复版本 >=10.1.2），并通过 pnpm override 将旧 esbuild 提升至 0.25.12；更新锁文件并重新运行迁移生成器、构建和测试。

最终生产依赖审计 **0 项漏洞**。完整依赖审计仍有 **1 项 high：picomatch <=4.0.7 的 extglob ReDoS，GHSA-fc5q-39xc-vjpf**，经 typescript-eslint -> typescript-estree -> tinyglobby 引入；评估时最新 picomatch 仍为 4.0.7，公告没有可用修复版本。本期没有对公网开放开发工具，也不接收用户自定义 glob；该问题不在运行时依赖图中。未通过忽略公告或伪造版本消除报告；开发环境零漏洞门槛标记 BLOCKED，待上游修复。

drizzle-kit 两个 @esbuild-kit 间接包被 npm 标记 deprecated，属于开发工具维护风险，未在服务运行时加载。override 后迁移生成器运行通过。采用 lockfile 和受限 esbuild postinstall allowlist，不启用全部第三方构建脚本。

文档依据：[Refine Data Provider](https://refine.dev/core/docs/data/data-provider/)、[RJSF Quickstart](https://rjsf-team.github.io/react-jsonschema-form/docs/quickstart/)、[RJSF Validation](https://rjsf-team.github.io/react-jsonschema-form/docs/usage/validation/)、[Drizzle](https://orm.drizzle.team/docs/get-started)、[picomatch 公告](https://github.com/advisories/GHSA-fc5q-39xc-vjpf)。仅使用官方文档/实际包元数据，不依赖第三方项目代码。
