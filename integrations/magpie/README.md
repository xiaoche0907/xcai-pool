# XcAIPool 的 Magpie 接入原型

Magpie 通过 MCP 提供 `models`、`schema`、`route_preview` 三个工具。XcAIPool 管理 LibTV 登录与目录。路由预览使用每个已启用账号自己的 CLI 配置，实时检查登录和模型目录。`listed` 只表示能查到目录条目，生成权限仍为 `unverified`。

在 XcAIPool API 已启动的 Windows 工作区运行。验收使用 Magpie 0.1.4453、Bun 1.4.2。

```powershell
$env:MAGPIE_BUN = (Get-Command bun.exe).Source
node integrations/magpie/run.mjs install
node integrations/magpie/run.mjs serve
```

MCP 客户端选择 Streamable HTTP，地址 `http://127.0.0.1:51668/mcp/magpie/tools/xcaipool`。本机冒烟脚本使用 Magpie 的本机令牌，XcAIPool 只读密钥由启动器从 `.env` 读取并传给插件进程。

```powershell
node integrations/magpie/smoke.mjs
```

请使用此启动器。它把 Magpie 的配置目录和 Windows 用户配置路径指向项目私有目录，并关闭自动发现 WSL Agent。直接用原用户环境运行 Magpie 会尝试同步已接入的 Agent 配置。此原型适用于本机验证，尚未做网络共享部署验证。

生成保持关闭。第二个 LibTV 用户完成官方登录并登记后，路由预览自动纳入该连接。正式生成仍需实现持久化任务提交与对账，并完成 LibTV 的生成验收。

参考 [Magpie 工具插件契约](https://github.com/yetone/magpie/blob/main/docs/subsystems/plugin-tools.md)。本目录只包含 XcAIPool 的插件与启动器。
