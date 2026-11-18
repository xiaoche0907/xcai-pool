import "dotenv/config";
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
const browser = await chromium.launch({ channel: "msedge", headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1040 },
  deviceScaleFactor: 1,
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
  await page.screenshot({
    path: "docs/p1/screenshots/overview.png",
    fullPage: true,
  });
  checks.push("登录与数据库总览");
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
  await page.getByRole("link", { name: "审计日志", exact: true }).click();
  await page
    .getByText("p0.generation_failed", { exact: true })
    .first()
    .waitFor();
  checks.push("P0 失败与真实操作审计");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("link", { name: "总览", exact: true }).click();
  await page.getByRole("heading", { name: "LibTV 工作台" }).waitFor();
  const toast = page.getByRole("button", { name: "关闭通知" });
  if (await toast.isVisible()) await toast.click();
  await page.screenshot({
    path: "docs/p1/screenshots/mobile.png",
    fullPage: true,
  });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  if (overflow) throw new Error("Mobile page overflow");
  checks.push("390px 移动布局无横向溢出");
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
