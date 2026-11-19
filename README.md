# XcAIPool

LibTV 单平台账号池。当前已实现 **P1-A 只读业务后台**：React/Vite + Refine + RJSF、Fastify、PostgreSQL/Drizzle。真实生成硬关闭。

[P0 实测报告与阻塞项](docs/p0/README.md) · [图像/视频完整模型列表](docs/p0/models.md) · [完整 Schema](docs/p0/schemas)

当前 CLI 1.2.0；账号验证、模型列表/Schema、测试画布、参考素材上传连线与资源下载已验证。文生图与文生视频均被官方服务以“图库空间不足”拒绝，尚未取得生成结果。用户选择保留当前记录，待容量处理后继续验收。

[P1-A 逐项验收](docs/p1-acceptance-report.md) · [架构](docs/architecture.md) · [API](docs/api.md) · [依赖选型](docs/adr/001-open-source.md) · [CLI 兼容性](docs/upstream-cli-compat.md)

## 本机运行

Node **24.x**、Corepack / pnpm **10.32.1**、Docker Desktop。独立数据库容器 `framepool-p1-postgres-1`，只绑定本机 `55432`，数据卷独立于境彻。已有 `.env` 时直接复用，不运行初始化。

```powershell
corepack pnpm@10.32.1 install --frozen-lockfile
# 仅首次、且 .env 不存在时执行：写入本机默认管理员密钥，随机生成只读密钥
powershell -NoProfile -File tools/p1/setup-local.ps1
docker compose --env-file .local/framepool-p1/compose.env -f infra/docker-compose.dev.yml up -d --wait
corepack pnpm@10.32.1 db:migrate
corepack pnpm@10.32.1 build
corepack pnpm@10.32.1 start
```

服务启动时打印本机访问地址。在本地 `.env` 查看 `ADMIN_API_KEY` 或 `VIEWER_API_KEY` 后登录。新数据库的账号池为空，模型和画布可在添加账号后在线同步。请先安装 LibTV CLI 1.2.0，并将 `LIBTV_BINARY` 指向实际可执行文件。后台在浏览器标签页的会话存储中保存已验证的密钥，刷新时重新验证，退出时清除。

开发模式：分别执行 `corepack pnpm@10.32.1 dev` 与 `corepack pnpm@10.32.1 dev:web`；Vite 只绑定本机 `4311`，API 端口读取 `.env`。生产静态构建由 Fastify 提供，不需要单独运行 Vite。

## 软件更新

使用 Git 克隆项目的 `main` 分支并以 `corepack pnpm start` 启动后，管理员可在「软件更新」检查 GitHub 最新提交，确认安装后服务会自动重启。首次升级到包含此功能的版本需要手动部署一次。更新要求安装目录没有未提交的改动。详情见 [运维文档](docs/operations.md)。

## 添加 LibTV 账号

在「账号池」选择「添加账号」，填写名称后选择官方网页或手机号验证码。获取链接后点击「打开独立登录窗口」，在其中完成 LibTV 登录或微信扫码。也可以复制链接到手动打开的隐私窗口。手机号登录由 LibTV 发送短信，遇到人机验证可切换到官方网页。完成授权后点击「保存账号」。若误登已登记账号，点击「重新授权」更换账号。每个账号使用独立的本地配置与工作目录。等待网页登录时可直接切换到手机号验证。

展开账号可选择「移除账号」。移除后，该账号的画布会从画布管理隐藏，已有画布快照、任务记录和本地授权文件继续保留。

已有 P0 数据的安装可从「任务记录」查看真实生成尝试。当前未启用提交生成和任务队列。

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
