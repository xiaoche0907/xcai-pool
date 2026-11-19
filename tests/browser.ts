import "dotenv/config";
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1040 },
  deviceScaleFactor: 1,
  colorScheme: "light",
});
const errors: string[] = [],
  failures: string[] = [];
page.on("pageerror", (e) => errors.push(e.message));
page.on("response", (r) => {
  if (r.url().includes("/api/") && r.status() >= 400)
    failures.push(`${r.status()} ${new URL(r.url()).pathname}`);
});
const checks: string[] = [];
await mkdir("docs/p1/screenshots", { recursive: true });
try {
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto(`http://127.0.0.1:${process.env.PORT ?? 4310}`);
  await page
    .getByLabel("API 密钥", { exact: true })
    .fill(process.env.ADMIN_API_KEY!);
  await page.getByRole("button", { name: "连接工作台", exact: true }).click();
  await page.getByRole("heading", { name: "LibTV 工作台" }).waitFor();
  await page.reload();
  await page.getByRole("heading", { name: "LibTV 工作台" }).waitFor();
  if (await page.getByLabel("API 密钥", { exact: true }).isVisible())
    throw new Error("Reload unexpectedly returned to login");
  checks.push("刷新后重新验证并恢复登录");
  await page.screenshot({
    path: "docs/p1/screenshots/overview.png",
    fullPage: true,
    animations: "disabled",
  });
  checks.push("登录与数据库总览");
  const theme = page.getByRole("button", { name: "切换深浅模式" });
  await theme.click();
  await page.reload();
  await page.getByRole("heading", { name: "LibTV 工作台" }).waitFor();
  if ((await page.locator("html").getAttribute("data-theme")) !== "dark")
    throw new Error("Dark theme preference was lost on reload");
  await page.screenshot({
    path: "docs/p1/screenshots/overview-dark.png",
    animations: "disabled",
  });
  await theme.click();
  if ((await page.locator("html").getAttribute("data-theme")) !== "light")
    throw new Error("Light theme option did not apply");
  await page.emulateMedia({ reducedMotion: "reduce" });
  if (
    (await page
      .locator(".page-enter")
      .evaluate((node) => getComputedStyle(node).animationName)) !== "none"
  )
    throw new Error("Page transition ignores reduced motion preference");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  checks.push("深浅主题切换、主题记忆与减少动态效果");
  await page.getByRole("button", { name: "复制 API 地址" }).click();
  await page.getByText("已复制 API 地址", { exact: true }).waitFor();
  const copiedEndpoint = await page.evaluate(() =>
    navigator.clipboard.readText(),
  );
  if (copiedEndpoint !== new URL("/api/v1", page.url()).href)
    throw new Error("Copied gateway address does not match the current origin");
  checks.push("复制当前网关地址");
  await page.getByRole("link", { name: "网关", exact: true }).click();
  await page.getByText("运行中", { exact: true }).waitFor();
  const refreshedConfig = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname === "/api/v1/config" && response.ok(),
  );
  await page.getByRole("button", { name: "刷新状态" }).click();
  await refreshedConfig;
  await page.getByText("接入配置", { exact: true }).click();
  await page.getByRole("button", { name: "复制调用示例" }).click();
  await page.getByText("已复制调用示例", { exact: true }).waitFor();
  const example = await page.evaluate(() => navigator.clipboard.readText());
  if (
    !example.includes("<VIEWER_API_KEY>") ||
    example.includes(process.env.ADMIN_API_KEY!)
  )
    throw new Error(
      "Gateway example must contain a placeholder and no admin key",
    );
  const searchGateway = page.getByRole("searchbox", { name: "查找网关模型" });
  await searchGateway.fill("z-image");
  await page
    .getByRole("button", { name: "复制模型 ID z-image", exact: true })
    .click();
  await page.getByText("已复制模型 ID", { exact: true }).waitFor();
  if ((await page.evaluate(() => navigator.clipboard.readText())) !== "z-image")
    throw new Error("Incorrect model ID copied");
  await page.getByRole("button", { name: "复制全部 ID" }).click();
  await page.getByText("已复制全部模型 ID", { exact: true }).waitFor();
  const allIds = (
    await page.evaluate(() => navigator.clipboard.readText())
  ).split(/\r?\n/);
  if (allIds.length <= 1 || !allIds.includes("z-image"))
    throw new Error("Gateway did not copy the full catalog");
  await searchGateway.fill("");
  await page.getByRole("button", { name: "关闭通知" }).click();
  await page.screenshot({ path: "docs/p1/screenshots/gateway.png" });
  checks.push("网关状态刷新、接入示例、模型搜索及 ID 复制");
  await page.getByRole("link", { name: "模型中心", exact: true }).click();
  await page.getByLabel("搜索模型").fill("z-image");
  await page.getByRole("button", { name: "Z-image Turbo z-image" }).click();
  await page.getByRole("button", { name: "服务端校验参数" }).waitFor();
  await page.locator("textarea").fill("A red ceramic teapot on a table");
  await page.locator("#root_settings_quality").selectOption("1K");
  await page.locator("#root_settings_ratio").selectOption("1:1");
  if (
    await page.getByText("Unsupported field schema", { exact: false }).count()
  )
    throw new Error("RJSF rendered an unsupported field");
  await page.getByRole("button", { name: "服务端校验参数" }).click();
  await page.getByText("参数校验通过 · 上游生成权限与素材语义未验证").waitFor();
  checks.push("模型搜索 / RJSF 表单 / 服务端校验");
  if (
    !(await page
      .getByRole("button", { name: "生成已关闭", exact: true })
      .isDisabled())
  )
    throw new Error("Generation button enabled");
  await page.locator(".drawer").evaluate((element) => {
    element.scrollTop = 0;
  });
  await page.screenshot({
    path: "docs/p1/screenshots/model-form.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "原始 Schema", exact: true }).click();
  await page.locator(".drawer pre").waitFor();
  checks.push("完整原始 Schema");
  await page.getByRole("button", { name: "关闭模型详情" }).click();
  await page.getByRole("link", { name: "账号池", exact: true }).click();
  const addAccount = page.getByRole("button", {
    name: "添加账号",
    exact: true,
  });
  if (await addAccount.isVisible()) {
    await addAccount.click();
    const setup = page.getByRole("dialog", { name: "添加账号" });
    await setup.getByLabel("账号名称").fill("LibTV 验证账号");
    const method = setup.getByLabel("登录方式");
    await setup.getByText("正在检查本地授权…").waitFor({ state: "hidden" });
    if (await method.isEnabled()) {
      await method.selectOption("phone");
      const send = setup.getByRole("button", { name: "发送验证码" });
      await setup.getByLabel("手机号", { exact: true }).fill("123");
      if (!(await send.isDisabled()))
        throw new Error("Malformed phone number can reach SMS send");
      await setup.getByLabel("手机号", { exact: true }).fill("");
      await method.selectOption("web");
      checks.push("手机号登录方式可切换并校验格式");
    }
    if (process.env.XCAIPOOL_TEST_LIVE_LOGIN === "1") {
      const start = setup.getByRole("button", {
        name: /^(获取官方登录链接|重新授权|换另一个账号)$/,
      });
      const open = setup.getByRole("button", { name: "打开独立登录窗口" });
      if (!(await open.isVisible())) await start.click();
      await open.waitFor();
      await setup.getByRole("button", { name: "复制登录链接" }).click();
      const official = new URL(
        await page.evaluate(() => navigator.clipboard.readText()),
      );
      if (
        official.origin !== "https://www.liblib.tv" ||
        !official.searchParams
          .get("callback_url")
          ?.startsWith("http://127.0.0.1:")
      ) {
        throw new Error("LibTV official callback URL missing");
      }
      if (process.env.XCAIPOOL_TEST_ISOLATED_BROWSER === "1") {
        const launched = page.waitForResponse(
          (response) =>
            new URL(response.url()).pathname.endsWith("/login/open-browser") &&
            response.ok(),
        );
        await open.click();
        await launched;
        await setup.getByText(/已请求打开独立登录窗口/).waitFor();
        checks.push("独立浏览器窗口启动");
      }
      const cancelled = page.waitForResponse(
        (response) =>
          new URL(response.url()).pathname.endsWith("/login/cancel") &&
          response.ok(),
      );
      await method.selectOption("phone");
      await cancelled;
      await setup.getByLabel("手机号", { exact: true }).waitFor();
      checks.push("等待网页授权时可取消并切换到手机号");
    }
    await page.screenshot({ path: "docs/p1/screenshots/add-account.png" });
    await setup.getByRole("button", { name: "关闭添加账号" }).click();
    checks.push("添加账号弹窗和官方授权状态");
  }
  const account = page.locator(".account-entry").first();
  await account.locator("summary").click();
  await page.getByRole("button", { name: "诊断连接" }).waitFor();
  await page.screenshot({
    path: "docs/p1/screenshots/connections.png",
    fullPage: true,
  });
  checks.push("真实账号连接诊断视图");
  await page.getByRole("link", { name: "画布管理", exact: true }).click();
  await page.getByRole("button", { name: /FramePool P0 20261118/ }).click();
  await page.getByText("5 个节点 · 2 条边").waitFor();
  await page.screenshot({
    path: "docs/p1/screenshots/canvas.png",
    fullPage: true,
  });
  checks.push("真实画布 5 节点 / 2 边");
  await page.getByRole("link", { name: "任务记录", exact: true }).click();
  await page
    .getByRole("button", { name: "查看详情 p0-generation-failed-0" })
    .click();
  const task = page.getByRole("dialog", { name: "任务详情" });
  await task
    .getByText("LibTV 图库空间不足（1200000138）", { exact: true })
    .waitFor();
  await task.getByText("此次尝试没有生成输出。", { exact: true }).waitFor();
  const detail = page.waitForResponse(
    (response) =>
      new URL(response.url()).pathname ===
        "/api/v1/tasks/p0-generation-failed-0" &&
      response.request().method() === "GET" &&
      response.ok(),
  );
  await task.getByRole("button", { name: "刷新详情" }).click();
  await detail;
  await task.getByText("查看脱敏尝试记录 JSON", { exact: true }).click();
  await page.screenshot({ path: "docs/p1/screenshots/task-detail.png" });
  await task.getByRole("button", { name: "关闭详情", exact: true }).click();
  checks.push("任务详情只读刷新、失败原因与尝试记录");
  await page.getByRole("link", { name: "审计日志", exact: true }).click();
  await page
    .getByText("model.parameters-validated", { exact: true })
    .first()
    .waitFor();
  checks.push("可查阅本轮参数校验的实际审计记录");
  await page.setViewportSize({ width: 375, height: 812 });
  await page.getByRole("link", { name: "总览", exact: true }).click();
  await page.getByRole("heading", { name: "LibTV 工作台" }).waitFor();
  const toast = page.getByRole("button", { name: "关闭通知" });
  if (await toast.isVisible()) await toast.click();
  await page.screenshot({
    path: "docs/p1/screenshots/mobile.png",
    fullPage: true,
    animations: "disabled",
  });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  if (overflow) throw new Error("Mobile page overflow");
  await page.setViewportSize({ width: 812, height: 375 });
  if (
    await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    )
  )
    throw new Error("Landscape page overflow");
  checks.push("375px 手机竖屏和横屏无横向溢出");
  await page.getByRole("button", { name: "退出工作台" }).click();
  await page.reload();
  await page.getByLabel("API 密钥", { exact: true }).waitFor();
  checks.push("退出后刷新仍停留在登录页");
  if (errors.length || failures.length)
    throw new Error(JSON.stringify({ errors, failures }));
  console.log(`Browser checks: ${checks.length} PASS`);
} finally {
  await writeFile(
    "docs/p1/browser-checks.json",
    JSON.stringify(
      { checkedAt: new Date().toISOString(), checks, errors, failures },
      null,
      2,
    ),
  );
  await browser.close();
}
