# P1-A 本地运维与迁移

只支持本轮核验的 Windows / Node 24 / CLI 1.2.0。`.env`、Compose 私有密码文件、P0 凭据不能提交或用于复制生产授权。本轮没有修改境彻容器、数据库、代码或其监听端口。

## 启动与恢复

复用现有 `.env`。首次初始化脚本写入本机默认管理员密钥，并生成随机只读密钥、数据库密码和空闲 API 端口。发现已存在 `.env` 时直接拒绝覆盖。参考字段在 `infra/env.example`。

```powershell
docker compose --env-file .local/framepool-p1/compose.env -f infra/docker-compose.dev.yml up -d --wait
corepack pnpm@10.32.1 db:migrate
corepack pnpm@10.32.1 build
corepack pnpm@10.32.1 start
```

正常部署只运行数据库迁移，新库从空账号池开始。仅恢复历史 P0 环境时显式运行 `corepack pnpm bootstrap --p0`，该导入会恢复 P0 账号记录、模型、画布和任务证据。幂等导入只读取 P0 文件，不触发上游。Adapter 的生产进程边界只支持只读命令。

## GitHub 更新

- 使用 `git clone` 部署并保持在 `main` 分支。用 `corepack pnpm start` 启动，确保 GitHub、依赖仓库和 PostgreSQL 可访问。ZIP 解压部署及开发模式仅支持查询最新提交。
- 管理员在「软件更新」检查并确认安装。更新源为项目的 GitHub `main` 分支。安装进程只接受检查到的提交，并在安装前重新核对远端提交。存在未提交的改动、分支分叉或远端提交变化时，安装会停止。
- 安装依次执行 Git 快进、按锁文件安装依赖、构建、应用数据库迁移和重启。安装过程沿用现有 `.env`、数据库和 LibTV 授权目录。升级前可按下文备份数据库。
- 构建、迁移或启动失败时，更新进程尝试恢复旧代码和重新启动。若迁移已经成功，成功迁移会保留。需要回退数据库时使用升级前的备份。运行终端会显示自动恢复失败的阶段。

## 数据库

唯一新容器 `framepool-p1-postgres-1`，独立 Compose project `framepool-p1`、本机端口 55432、命名数据卷 `framepool-p1_framepool-p1-postgres`。数据库 `framepool` 是后台数据；`framepool_test` 仅供集成测试，测试代码不会清理后台数据库。

迁移文件 `packages/db/migrations/0000_fancy_lockheed.sql` 及 Drizzle journal 受版本管理。首次从空库建 5 张业务表、外键和唯一索引；重复迁移不重复建表。后续只新增迁移，不修改已应用迁移，不执行生产 push/drop。

迁移失败时事务回滚，服务不使用假数据降级；修复连接/迁移后重新运行。`provider_connections.owner_id` 预留未来租户归属；多租户权限隔离本轮未实施。

## 备份与回滚路径

本轮是首个数据库版本，没有旧业务库可回退。回滚应用可停用新服务并保留新库；不会影响 P0 CLI。不要使用 `docker compose down -v` 或删除 P0 配置目录。

数据库修改前备份（以下为运维指令，交付时未代替用户执行恢复/删除）：

```powershell
docker exec framepool-p1-postgres-1 pg_dump -U framepool -d framepool -Fc -f /tmp/framepool-p1.dump
docker cp framepool-p1-postgres-1:/tmp/framepool-p1.dump .local/framepool-p1/framepool-p1.dump
```

需要验证恢复时，创建独立的空库 `framepool_restore`，将上述 dump 复制回容器，再执行 `pg_restore -U framepool -d framepool_restore --no-owner /tmp/framepool-p1.dump`。核对表、模型数和关联后，停止本应用、只将其 DATABASE_URL 指向恢复库并重启；旧库保留，不能覆盖境彻数据库。不要对已有业务库直接执行 `--clean`。备份包含账号引用与审计，只保留在私有本地目录。

## API 认证与日志

ADMIN_API_KEY 与 VIEWER_API_KEY 必须不同。服务绑定 127.0.0.1 时，管理员口令至少 10 字符；其他绑定地址仍要求至少 32 字符。只读密钥始终至少 32 字符。后台将已验证的密钥保存在标签页的会话存储中，刷新时通过 `/api/v1/config` 重新验证。验证返回 401 或主动退出时会清除该会话。API 使用 Bearer 密钥，日志不打印 Authorization、Cookie、body 或原始 stdout。

审计保留参数数组、PID、退出码、只读查询耗时，以及模型/连接本地操作；账号身份脱敏，凭据内容不读取。用 requestId 对照服务错误类型；CLI 错误码映射见兼容性文档。

本轮遇到本机 4310 已被其他服务占用，改用 51667，并轮换本项目管理员密钥。未终止该端口原有进程。后续地址以 `.env` 与服务启动日志为准。

## 重启边界

重启 API 后只恢复数据库中的目录与快照；没有启动生成 Worker，没有未完成生成任务可重放。旧 P0 create/upload/run 标记从未修改。P1-B 的队列幂等、租约、kill/restart、Redis 断连、needs_reconciliation 验证尚未实施，不能以本轮重启/只读成功代替这些验收。

## P0 补验清单（未获本轮执行授权）

1. 用户确认图库容量恢复。
2. 核对旧节点、上游任务与实际扣费；不能仅凭 create 失败推定未扣费。
3. 用户明确授权新的生成尝试；创建全新 attempt，不删除旧标记。
4. 文生图、文生视频、参考图生图、首帧图生视频分别等待 CLI 终态。
5. 下载真实生成文件，校验媒体可读性、大小、哈希并回查画布。
