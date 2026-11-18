# XcAIPool / LibTV P1-A 逐项验收

日期：2026-11-18（Asia/Shanghai）。本期只执行 P1-A。**只读业务可运行；完整开发依赖零漏洞门槛仍 BLOCKED。** 未执行真实生成，未实施 P1-B/P2。

运行地址：**http://127.0.0.1:51667**。管理员/只读密钥在本地 `.env`，不在报告输出。已有 LibTV 登录配置原地复用，没有新登录、登出或空间切换。

## 逐项结果

| 验收项 | 结果 | 实际证据 / 限制 |
|---|---|---|
| P0 证据、Schema、脚本、登录配置、CLI、标记保留 | **PASS** | 189 个原文件哈希完全相同；`p1/preservation.json` |
| 非破坏性独立运行 | **PASS** | 独立 Compose project/数据库/数据卷；未操作境彻容器或源码；端口冲突后改用空闲端口 |
| 开源选型与依赖记录 | **PASS** | Refine 5.0.12、RJSF 6.11.1、Drizzle 0.45.4；29 个直接依赖版本/许可证，未复制项目；`adr/001-open-source.md` |
| pnpm 安装、lint、typecheck、build | **PASS** | pnpm 10.32.1 / Node 24.12.0，锁文件；构建按模型页拆包，无此前单包大小警告 |
| PostgreSQL 空库迁移及重复迁移 | **PASS** | 5 张业务表、索引、外键及 Drizzle journal；集成在独立测试库执行；迁移回滚路径见 `operations.md` |
| 65 模型目录/完整 Schema 导入 | **PASS** | DB 27 图像/38 视频；重复导入不增加版本或覆盖连接/禁用；在线同步不被旧证据回退 |
| 真实在线目录/Schema 同步 | **PASS** | 实际 CLI 只读同步 65 条，Fastify 实测返回；`p1/live-smoke.json` |
| 名称、哈希、版本、变更对比、禁用/下架 | **PASS** | 保留目录 modelName 与 Schema 名称；版本差异、下架 unverified、人工 disabled 和失败不提交半批的集成测试 |
| RJSF 动态表单与服务端二次校验 | **PASS** | 65 Schema / 209 推导模式可编译；枚举、settings、必填、边界、未知字段拒绝；实际浏览器填写与 API 校验 |
| 无法转换字段安全降级 | **PASS** | 不明字段只读保留并标注；13 个无法确认媒体规则的模式禁用参数校验，不宣称全 Schema 支持；列表见 `p1/safety-summary.json` |
| 账号池管理与脱敏 | **PASS** | account-01 原配置；实时授权诊断、别名、手动停用；不读凭据内容、不将空间当登录用户 |
| 画布查询与节点归一化 | **PASS** | 真实查询原 P0 画布，DB 保存 5 节点/2 边；只读刷新，不修改上游 |
| API 鉴权/管理员权限/核心响应校验 | **PASS** | 401/403、严格 Zod 请求与核心 DTO；别名更新不能写凭据路径；模型参数为 AJV 二次校验 |
| 前端真实 API | **PASS** | Refine DataProvider -> Fastify -> PostgreSQL；上游刷新经 CLI；页面无假额度/成功率/模型/节点/生成结果 |
| generation_enabled=false | **PASS** | UI 禁用、服务器任务拒绝、true 拒绝启动、Adapter 方法和进程白名单拒绝；审计 0 个禁止命令 |
| 自动化测试 | **PASS** | 22/22，0 失败；`p1/test-results.json`；CLI 替身仅用于测试分支 |
| 真实只读 API 冒烟 | **PASS** | 账号、目录/Schema、在线同步、画布列表、5/2 节点边、生成拦截和审计；`p1/live-smoke.json` |
| 桌面/移动关键路径 | **PASS** | 7 项浏览器检查，0 页面异常/失败 API；截图及 `p1/browser-checks.json` |
| 生产依赖安全检查 | **PASS** | pnpm audit --prod：0 项漏洞；`p1/safety-summary.json` |
| 完整开发依赖零漏洞 | **BLOCKED** | picomatch <=4.0.7 一项 high，来自 typescript-eslint 开发链，当前无修复版；未忽略公告；`p1/dependencies.json` |
| 图库容量恢复及真实生成输出 | **BLOCKED** | P0 1200000138，按用户要求未执行生成；没有生成图片/视频文件 |
| BullMQ/Redis、Mock Worker、Bull Board | **NOT IMPLEMENTED** | 仅评估，按 PRD 留到 P1-B；UI 明示未实施 |
| 任务幂等/租约/kill-restart/Redis 恢复 | **NOT IMPLEMENTED** | P1-B；不能用本轮只读重启或 P0 标记保护替代 |
| 第二真实登录用户/独立 Worker | **NOT IMPLEMENTED** | P2；保留 P0 account-02 空配置，不登录、不覆盖 |
| 生产部署与 Linux CLI | **NOT IMPLEMENTED** | 当前只验证 Windows 本地独立服务，不复制本地凭据到生产 |

## 改动与交付

| 路径 | 内容 |
|---|---|
| `apps/admin-web` | Refine 后台、RJSF 参数表单、真实 API 认证和数据提供者、移动布局 |
| `apps/api-server` | Fastify API/DTO/鉴权、模型与连接/画布/审计服务 |
| `packages/contracts` | 请求/响应类型、错误和硬关闭开关 |
| `packages/db` | Drizzle 表、初始迁移和 journal、连接工具 |
| `packages/model-normalizer` | Schema 转换、完整验证、差异、JSON 设置序列化 |
| `packages/libtv-cli-adapter` | 1.2.0 只读 CLI 进程与响应适配、脱敏与写命令拒绝 |
| `infra` | 独立 PostgreSQL Compose、环境字段示例 |
| `tools/p1` / `tests` | 安装辅助、导入/实测/保护/依赖工具、单元/集成/浏览器测试 |
| 根配置/锁文件/文档 | 可重复安装、lint/typecheck/build、架构/API/兼容/运维/选型和本报告 |

## 页面证据

[总览](p1/screenshots/overview.png) · [模型动态表单](p1/screenshots/model-form.png) · [账号管理](p1/screenshots/connections.png) · [画布节点](p1/screenshots/canvas.png) · [移动总览](p1/screenshots/mobile.png)。

## 已知边界与下一步

1. 开发工具漏洞待上游发布修复版本后复审；生产依赖审计无漏洞不代表完整安全审计。
2. JSON 参数通过不表示素材语义、账号额度、模型权限或真实生成可用；目录统一显示“目录已收录 / 生成权限未验证”。
3. 数据库 owner_id 仅预留迁移接口，当前为本地单管理员/只读角色，不是多租户产品。
4. 上游个人根空间列表只登记已查询画布，不发现/切换团队空间。除 P0 画布外，新登记画布须显式刷新节点。
5. 继续按用户选择保留 P0；图库恢复后仍需独立授权新的生成尝试和对账，清单见 `operations.md`。本轮不自动进入 P1-B。
