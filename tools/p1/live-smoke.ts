import "dotenv/config";
import { writeFile, mkdir } from "node:fs/promises";
const base = `http://127.0.0.1:${process.env.PORT ?? 4310}/api/v1`;
const checks: any[] = [];
async function check(
  name: string,
  url: string,
  method = "GET",
  body?: unknown,
) {
  const response = await fetch(base + url, {
    method,
    headers: {
      authorization: `Bearer ${process.env.ADMIN_API_KEY}`,
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });
  const data = await response.json();
  checks.push({ name, status: response.status, data });
  if (!response.ok) throw new Error(`${name}: ${response.status}`);
  console.log(`${name}: PASS`);
  return data;
}
await mkdir("docs/p1", { recursive: true });
try {
  await check("config", "/config");
  await check(
    "account-diagnosis",
    "/admin/connections/account-01/diagnose",
    "POST",
    {},
  );
  await check("connections", "/connections");
  await check("online-model-sync", "/admin/models/sync", "POST", {});
  await check("image-models", "/models?type=image");
  await check("video-models", "/models?type=video");
  await check("schema-z-image", "/models/z-image/schema");
  await check("upstream-projects", "/admin/projects/discover", "POST", {});
  await check(
    "upstream-canvas",
    "/admin/projects/p0-canvas/refresh",
    "POST",
    {},
  );
  const response = await fetch(base + "/tasks", {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.ADMIN_API_KEY}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({ executionMode: "real" }),
  });
  const blocked = await response.json();
  checks.push({
    name: "generation-disabled",
    status: response.status,
    data: blocked,
  });
  if (response.status !== 403 || blocked.error.code !== "GENERATION_DISABLED")
    throw new Error("Generation guard failed");
  await check("audit-events", "/admin/audit-events");
} finally {
  await writeFile(
    "docs/p1/live-smoke.json",
    JSON.stringify({ checkedAt: new Date().toISOString(), checks }, null, 2),
  );
}
