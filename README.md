# XcAIPool

LibTV 单平台账号池。当前已实现 **P1-A 只读业务后台**：React/Vite + Refine + RJSF、Fastify、PostgreSQL/Drizzle。真实生成硬关闭。

[P0 实测报告与阻塞项](docs/p0/README.md) · [图像/视频完整模型列表](docs/p0/models.md) · [完整 Schema](docs/p0/schemas)

当前 CLI 1.2.0；账号验证、模型列表/Schema、测试画布、参考素材上传连线与资源下载已验证。文生图与文生视频均被官方服务以“图库空间不足”拒绝，尚未取得生成结果。用户选择保留当前记录，待容量处理后继续验收。

[P1-A 逐项验收](docs/p1-acceptance-report.md) · [架构](docs/architecture.md) · [API](docs/api.md) · [依赖选型](docs/adr/001-open-source.md) · [CLI 兼容性](docs/upstream-cli-compat.md)

## 本机运行

Node **24.x**、Corepack / pnpm **10.32.1**、Docker Desktop。独立数据库容器 `framepool-p1-postgres-1`，只绑定本机 `55432`，数据卷独立于境彻。已有 `.env` 时直接复用，不运行初始化。

```powershell
corepack pnpm@10.32.1 install --frozen-lockfile
# 仅首次、且 .env 不存在时执行：生成随机密钥，不修改 LibTV 配置
powershell -NoProfile -File tools/p1/setup-local.ps1
docker compose --env-file .local/framepool-p1/compose.env -f infra/docker-compose.dev.yml up -d --wait
corepack pnpm@10.32.1 db:migrate
corepack pnpm@10.32.1 bootstrap
corepack pnpm@10.32.1 build
corepack pnpm@10.32.1 start
```

服务打印本机访问地址；本轮运行地址为 **http://127.0.0.1:51667**。在本地 `.env` 查看 `ADMIN_API_KEY` 或 `VIEWER_API_KEY` 后登录，勿发送密钥。后台和 API 同源，认证密钥只保存在页面内存。`infra/env.example` 是字段说明，不能直接使用示例密钥。

开发模式：分别执行 `corepack pnpm@10.32.1 dev` 与 `corepack pnpm@10.32.1 dev:web`；Vite 只绑定本机 `4311`，API 端口读取 `.env`。生产静态构建由 Fastify 提供，不需要单独运行 Vite。

## 添加 LibTV 账号

添加第二个 LibTV 用户时，在项目目录运行 `corepack pnpm libtv:login`，用浏览器隐私窗口打开终端给出的官方链接。完成授权后，在后台「账号池」点击「验证并登记第二个账号」。后台会比对两个登录用户，拒绝重复登记主账号。第二个账号使用单独的本地配置与工作目录。

## 验证

```powershell
corepack pnpm@10.32.1 lint
corepack pnpm@10.32.1 typecheck
corepack pnpm@10.32.1 test
corepack pnpm@10.32.1 build
corepack pnpm@10.32.1 test:browser
corepack pnpm@10.32.1 preservation:check
```

集成测试仅允许本机 `framepool` 连接，并另建 `framepool_test` 数据库；只清理测试库数据。浏览器测试使用已安装 Edge，需先启动本服务。`tools/p1/live-smoke.ts` 会执行账号诊断、65 模型在线只读同步、画布查询并写入本项目数据库；不执行上游生成或画布修改。

P1-B（BullMQ/Redis/Bull Board、Mock Worker、租约/幂等恢复）、真实生成补验和第二个账号的独立任务调度留待后续阶段。图库容量阻断未解除。迁移与停服说明见 [运维文档](docs/operations.md)。
