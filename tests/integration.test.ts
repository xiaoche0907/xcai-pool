import "dotenv/config";
import { beforeAll, afterAll, describe, it, expect } from "vitest";
import postgres from "postgres";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { eq } from "drizzle-orm";
import { openDatabase } from "../packages/db/src/index.js";
import {
  models,
  auditEvents,
  projects,
  connections,
} from "../packages/db/src/schema.js";
import { FramePoolService } from "../apps/api-server/src/service.js";
import { createApp } from "../apps/api-server/src/app.js";
import { LibTVCLIAdapter } from "../packages/libtv-cli-adapter/src/index.js";
import { readFile } from "node:fs/promises";
import path from "node:path";
const admin = "test-admin-".padEnd(64, "a"),
  viewer = "test-viewer-".padEnd(64, "v");
let store: ReturnType<typeof openDatabase>,
  service: FramePoolService,
  app: ReturnType<typeof createApp>;
let cliCalls = 0;
const auth = { authorization: `Bearer ${admin}` };
beforeAll(async () => {
  const mainUrl = new URL(process.env.DATABASE_URL!);
  if (mainUrl.hostname !== "127.0.0.1" || mainUrl.pathname !== "/framepool")
    throw new Error(
      "Integration tests require the isolated local FramePool database.",
    );
  const management = postgres(mainUrl.toString());
  if (
    !(
      await management`select 1 from pg_database where datname='framepool_test'`
    ).length
  )
    await management.unsafe("CREATE DATABASE framepool_test");
  await management.end();
  mainUrl.pathname = "/framepool_test";
  store = openDatabase(mainUrl.toString());
  await migrate(store.db, { migrationsFolder: "packages/db/migrations" });
  // This database is created only for tests; never truncate the working FramePool database.
  await store.client.unsafe(
    "TRUNCATE canvas_nodes, projects, provider_models, provider_connections, audit_events CASCADE",
  );
  service = new FramePoolService(
    store.db,
    process.cwd(),
    () =>
      new LibTVCLIAdapter(async (args) => {
        cliCalls++;
        if (args.includes("--run")) throw new Error("Forbidden test path");
        if (args[0] === "project" && args[1] !== "list") {
          const r = JSON.parse(
            (
              await readFile("docs/p0/evidence/canvas-snapshot.json", "utf8")
            ).replace(/^\uFEFF/, ""),
          );
          return { stdout: r.stdout, stderr: "", code: 0, durationMs: 0 };
        }
        return {
          stdout: "",
          stderr: "401 not logged in",
          code: 1,
          durationMs: 0,
        };
      }),
  );
  app = createApp(service, { admin, viewer }, false);
  await app.ready();
});
afterAll(async () => {
  await app?.close();
  await store?.client.end();
});
describe("真实 PostgreSQL / Drizzle / Fastify 集成", () => {
  it("新库从空账号池启动，在线同步需要用户先添加账号", async () => {
    const list = await app.inject({
      url: "/api/v1/connections",
      headers: auth,
    });
    expect(list.json().data).toEqual([]);
    await expect(service.syncModels("test")).rejects.toMatchObject({
      code: "CONNECTION_REQUIRED",
    });
    await expect(service.discoverProjects("test")).rejects.toMatchObject({
      code: "CONNECTION_REQUIRED",
    });
  });
  it("鉴权与管理员边界", async () => {
    expect((await app.inject({ url: "/api/v1/models" })).statusCode).toBe(401);
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/admin/models/import-evidence",
          headers: { authorization: `Bearer ${viewer}` },
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
    const config = await app.inject({ url: "/api/v1/config", headers: auth });
    expect(config.json().generationEnabled).toBe(false);
  });
  it("软件更新由管理员访问并校验提交 ID", async () => {
    const url = "/api/v1/admin/update";
    const headers = { authorization: `Bearer ${viewer}` };
    expect((await app.inject({ url, headers })).statusCode).toBe(403);
    expect(
      (
        await app.inject({
          method: "POST",
          url: url + "/install",
          headers,
          payload: {},
        })
      ).statusCode,
    ).toBe(403);
    expect((await app.inject({ url, headers: auth })).json()).toMatchObject({
      updating: false,
    });
    expect(
      (
        await app.inject({
          method: "POST",
          url: url + "/install",
          headers: auth,
          payload: { commit: "refs/heads/main" },
        })
      ).statusCode,
    ).toBe(400);
  });
  it("CLI 缺失时继续提供 API，并报告 CLI 未就绪", async () => {
    const unavailable = createApp(
      new FramePoolService(
        store.db,
        path.join(process.cwd(), "tests", "missing-cli-workdir"),
      ),
      { admin, viewer },
      false,
    );
    try {
      const response = await unavailable.inject({
        url: "/api/v1/config",
        headers: auth,
      });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toMatchObject({
        cliVersion: null,
        cliStatus: "unavailable",
      });
    } finally {
      await unavailable.close();
    }
  });
  it("从 P0 导入 65 模型且重复导入保持版本、禁用和账号状态", async () => {
    const invoke = () =>
      app.inject({
        method: "POST",
        url: "/api/v1/admin/models/import-evidence",
        headers: auth,
        payload: {},
      });
    const first = await invoke();
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ imported: 65, image: 27, video: 38 });
    await invoke();
    const rows = await store.db.select().from(models);
    expect(rows).toHaveLength(65);
    expect(rows.every((m) => m.schemaVersion === 1)).toBe(true);
    expect(
      (
        await app.inject({ url: "/api/v1/models?type=video", headers: auth })
      ).json().total,
    ).toBe(38);
    expect(
      (
        await app.inject({ url: "/api/v1/models?q=z-image", headers: auth })
      ).json().data[0].directoryModelName,
    ).toBe("Z-image Turbo");
  });
  it("服务器二次校验与明确的错误码", async () => {
    const url = "/api/v1/models/z-image/validate";
    const base = {
      modeType: "text2image",
      parameters: {
        prompt: "red teapot",
        count: 1,
        settings: { quality: "1K", ratio: "1:1" },
      },
    };
    expect(
      (
        await app.inject({ method: "POST", url, headers: auth, payload: base })
      ).json().valid,
    ).toBe(true);
    const invalid = await app.inject({
      method: "POST",
      url,
      headers: auth,
      payload: { ...base, parameters: { ...base.parameters, unknown: 1 } },
    });
    expect(invalid.statusCode).toBe(422);
    expect(invalid.json().error.code).toBe("INVALID_PARAMETERS");
    expect(
      (await app.inject({ url: "/api/v1/models?type=audio", headers: auth }))
        .statusCode,
    ).toBe(400);
    expect(
      (
        await app.inject({
          method: "POST",
          url,
          headers: auth,
          payload: { ...base, extra: 1 },
        })
      ).statusCode,
    ).toBe(400);
  });
  it("模型禁用不被导入覆盖；重新启用后权限仍未验证", async () => {
    await app.inject({
      method: "PATCH",
      url: "/api/v1/admin/models/z-image",
      headers: auth,
      payload: { disabled: true },
    });
    await service.importEvidence("test");
    expect((await service.model("z-image")).availabilityState).toBe("disabled");
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/api/v1/models/z-image/validate",
          headers: auth,
          payload: {
            modeType: "text2image",
            parameters: { prompt: "x", count: 1 },
          },
        })
      ).statusCode,
    ).toBe(409);
    await app.inject({
      method: "PATCH",
      url: "/api/v1/admin/models/z-image",
      headers: auth,
      payload: { disabled: false },
    });
    expect((await service.model("z-image")).availabilityState).toBe(
      "unverified",
    );
  });
  it("画布归一化、只读刷新和数据库保存 5 节点 / 2 边", async () => {
    const result = await app.inject({
      method: "POST",
      url: "/api/v1/admin/projects/p0-canvas/refresh",
      headers: auth,
      payload: {},
    });
    expect(result.statusCode).toBe(200);
    expect(result.json().nodes).toHaveLength(5);
    expect(result.json().edges).toHaveLength(2);
    const view = await app.inject({
      url: "/api/v1/projects/p0-canvas/nodes",
      headers: auth,
    });
    expect(view.json().source).toBe("upstream");
    expect(view.json().nodes[0].nodeKey).toBeTruthy();
  });
  it("连接开关和别名入库；不允许路径或凭据字段写入", async () => {
    const url = "/api/v1/admin/connections/account-01";
    expect(
      (
        await app.inject({
          method: "PATCH",
          url,
          headers: auth,
          payload: { alias: "测试别名", enabled: false },
        })
      ).statusCode,
    ).toBe(200);
    expect(
      (
        await app.inject({
          method: "POST",
          url: url + "/diagnose",
          headers: auth,
          payload: {},
        })
      ).json().error.code,
    ).toBe("CONNECTION_DISABLED");
    expect(
      (
        await app.inject({
          method: "PATCH",
          url,
          headers: auth,
          payload: { configDirRef: "../../" },
        })
      ).statusCode,
    ).toBe(400);
    await service.importEvidence("test");
    const connections = await service.connectionViews();
    expect(connections[0].enabled).toBe(false);
    expect(connections[0].alias).toBe("测试别名");
    expect(JSON.stringify(connections)).not.toContain("credentialRef");
  });
  it("真实/Mock/畸形任务请求一律被硬开关阻止，未触达 CLI", async () => {
    const before = cliCalls;
    for (const body of [
      { executionMode: "real" },
      { executionMode: "mock" },
      {},
    ]) {
      const r = await app.inject({
        method: "POST",
        url: "/api/v1/tasks",
        headers: auth,
        payload: body,
      });
      expect(r.statusCode).toBe(403);
      expect(r.json().error.code).toBe("GENERATION_DISABLED");
    }
    expect(cliCalls).toBe(before);
    expect(
      (await app.inject({ url: "/api/v1/tasks", headers: auth })).statusCode,
    ).toBe(200);
  });
  it("手机号登录限制为管理员，未发送时拒绝验证，且不触达 LibTV", async () => {
    const url = "/api/v1/admin/connections/login/phone";
    const payload = { phone: "19900000000", code: "000000" };
    const denied = await app.inject({
      method: "POST",
      url,
      headers: { authorization: `Bearer ${viewer}` },
      payload,
    });
    expect(denied.statusCode).toBe(403);
    const invalid = await app.inject({
      method: "POST",
      url,
      headers: auth,
      payload: { phone: "invalid" },
    });
    expect(invalid.statusCode).toBe(400);
    const noSend = await app.inject({
      method: "POST",
      url,
      headers: auth,
      payload,
    });
    expect(noSend.statusCode).toBe(409);
    expect(noSend.json().error.code).toBe("LIBTV_SMS_REQUIRED");
    expect(noSend.body).not.toContain(payload.phone);
  });
  it("数据库中保留 P0 失败与参数校验审计，没有虚构生成结果", async () => {
    const failures = await store.db
      .select()
      .from(auditEvents)
      .where(eq(auditEvents.action, "p0.generation_failed"));
    expect(failures).toHaveLength(2);
    expect(failures.every((f) => !f.redactedMetadata.hasGeneratedOutput)).toBe(
      true,
    );
    const audit = await app.inject({
      url: "/api/v1/admin/audit-events",
      headers: auth,
    });
    expect(audit.json().data.length).toBeGreaterThan(5);
  });
  it("只读同步记录版本差异、标记下架、保留人工禁用；失败不提交半批数据", async () => {
    await app.inject({
      method: "PATCH",
      url: "/api/v1/admin/connections/account-01",
      headers: auth,
      payload: { enabled: true },
    });
    await app.inject({
      method: "PATCH",
      url: "/api/v1/admin/models/seedream-4",
      headers: auth,
      payload: { disabled: true },
    });
    const raw = JSON.parse(
      (await readFile("docs/p0/schemas/z-image.json", "utf8")).replace(
        /^\uFEFF/,
        "",
      ),
    );
    raw.schema.properties.prompt.maxLength = 99;
    const syncService = new FramePoolService(
      store.db,
      process.cwd(),
      () =>
        new LibTVCLIAdapter(async (args) => ({
          stdout: JSON.stringify(
            args[1] === "search"
              ? {
                  matches:
                    args[3] === "image"
                      ? [{ modelKey: "z-image", modelName: "Z-image Turbo" }]
                      : [],
                }
              : raw,
          ),
          stderr: "",
          code: 0,
          durationMs: 0,
        })),
    );
    await syncService.syncModels("test");
    const changed = await service.model("z-image");
    expect(changed.schemaVersion).toBe(2);
    expect(changed.changesJson).toContain(
      "/schema/properties/prompt/maxLength",
    );
    expect(changed.previousSchemaJson).not.toBeNull();
    expect((await service.model("wanxiang-plus")).availabilityState).toBe(
      "unverified",
    );
    expect((await service.model("seedream-4")).availabilityState).toBe(
      "disabled",
    );
    const failing = new FramePoolService(
      store.db,
      process.cwd(),
      () =>
        new LibTVCLIAdapter(async () => ({
          stdout: "",
          stderr: "401",
          code: 1,
          durationMs: 0,
        })),
    );
    await expect(failing.syncModels("test")).rejects.toMatchObject({
      code: "LIBTV_NOT_AUTHENTICATED",
    });
    expect((await service.model("z-image")).schemaHash).toBe(
      changed.schemaHash,
    );
  });
  it("迁移可重复执行，开关 true 时拒绝启动", async () => {
    await expect(
      migrate(store.db, { migrationsFolder: "packages/db/migrations" }),
    ).resolves.toBeUndefined();
    const before = process.env.GENERATION_ENABLED;
    process.env.GENERATION_ENABLED = "true";
    try {
      expect(() => createApp(service, { admin, viewer }, false)).toThrow(
        "GENERATION_ENABLED=false",
      );
    } finally {
      process.env.GENERATION_ENABLED = before ?? "false";
    }
  });
  it("移除账号后隐藏画布及节点，保留数据库快照和任务历史", async () => {
    const url = "/api/v1/admin/connections/account-01";
    expect(
      (
        await app.inject({
          method: "DELETE",
          url,
          headers: { authorization: `Bearer ${viewer}` },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (await app.inject({ method: "DELETE", url, headers: auth })).statusCode,
    ).toBe(200);
    expect(await service.connectionViews()).toEqual([]);
    expect(
      (await app.inject({ url: "/api/v1/projects", headers: auth })).json()
        .data,
    ).toEqual([]);
    expect(
      (
        await app.inject({
          url: "/api/v1/projects/p0-canvas/nodes",
          headers: auth,
        })
      ).statusCode,
    ).toBe(404);
    expect(
      await store.db
        .select()
        .from(projects)
        .where(eq(projects.id, "p0-canvas")),
    ).toMatchObject([{ connectionId: "account-01" }]);
    expect(await service.generationRecords()).toMatchObject({ total: 2 });
    expect(
      await service.generationRecords("p0-generation-failed-0"),
    ).toMatchObject({
      connectionId: "account-01",
      connectionAlias: expect.any(String),
      projectUuid: expect.stringMatching(/^[a-f0-9]{32}$/),
      projectTitle: expect.any(String),
    });
    await expect(service.adapter("account-01")).rejects.toMatchObject({
      code: "CONNECTION_NOT_FOUND",
    });
    expect(
      (await app.inject({ method: "DELETE", url, headers: auth })).statusCode,
    ).toBe(404);
  });
  it("画布发现严格使用指定账号，同一上游 UUID 分别归档", async () => {
    const ids = ["account-02", "account-03"];
    await store.db.insert(connections).values(
      ids.map((id) => ({
        id,
        provider: "libtv",
        alias: id,
        credentialRef: "test",
        configDirRef: id,
      })),
    );
    const projectUuid = "1".repeat(32);
    const used: string[] = [];
    const scoped = createApp(
      new FramePoolService(
        store.db,
        process.cwd(),
        (id) =>
          new LibTVCLIAdapter(async (args) => {
            expect(args.slice(0, 2)).toEqual(["project", "list"]);
            used.push(id);
            return {
              stdout: JSON.stringify({
                total: 1,
                projectMetaList: [{ uuid: projectUuid, name: id }],
              }),
              stderr: "",
              code: 0,
              durationMs: 0,
            };
          }),
      ),
      { admin, viewer },
      false,
    );
    try {
      for (const id of ids.slice().reverse()) {
        const response = await scoped.inject({
          method: "POST",
          url: "/api/v1/admin/projects/discover",
          headers: auth,
          payload: { connectionId: id },
        });
        expect(response.json()).toEqual({ discovered: 1 });
      }
      expect(used).toEqual(["account-03", "account-02"]);
      const list = await scoped.inject({
        url: "/api/v1/projects",
        headers: auth,
      });
      expect(list.json().data).toEqual(
        expect.arrayContaining(
          ids.map((id) =>
            expect.objectContaining({
              connectionId: id,
              projectUuid,
              id: `${id}:${projectUuid}`,
            }),
          ),
        ),
      );
      const removed = await scoped.inject({
        method: "POST",
        url: "/api/v1/admin/projects/discover",
        headers: auth,
        payload: { connectionId: "account-01" },
      });
      expect(removed.statusCode).toBe(404);
      expect(used).toHaveLength(2);
    } finally {
      await scoped.close();
    }
  });
});
