import Fastify, { LogController } from "fastify";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import path from "node:path";
import { createHash, timingSafeEqual } from "node:crypto";
import { z, ZodError } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import type { FramePoolService } from "./service.js";
import { registerUpdateRoutes } from "./update-routes.js";
import { models, connections } from "../../../packages/db/src/schema.js";
import {
  GENERATION_ENABLED,
  AppError,
  listQuery,
  modelKeySchema,
  validateRequest,
  connectionPatch,
  publicModelSchema,
  responseContracts,
} from "../../../packages/contracts/src/index.js";
import {
  normalizeModel,
  validateParameters,
  serializeSettings,
} from "../../../packages/model-normalizer/src/index.js";
export function createApp(
  service: FramePoolService,
  keys: { admin: string; viewer: string },
  serveWeb = true,
) {
  const adminMinLength =
    (process.env.HOST ?? "127.0.0.1") === "127.0.0.1" ? 10 : 32;
  if (
    keys.admin.length < adminMinLength ||
    keys.viewer.length < 32 ||
    keys.admin === keys.viewer
  )
    throw new Error(
      `Distinct API keys are required. Minimum lengths: admin ${adminMinLength}, viewer 32.`,
    );
  if (
    process.env.GENERATION_ENABLED &&
    process.env.GENERATION_ENABLED !== "false"
  )
    throw new Error("P1-A requires GENERATION_ENABLED=false.");
  const app = Fastify({
    logger: {
      level: "info",
      redact: ["req.headers.authorization", "req.headers.cookie", "body"],
    },
    bodyLimit: 256 * 1024,
    logController: new LogController({ disableRequestLogging: true }),
  });
  const matches = (a: string, b: string) =>
    timingSafeEqual(
      createHash("sha256").update(a).digest(),
      createHash("sha256").update(b).digest(),
    );
  const actors = new WeakMap<object, string>();
  app.addHook("preSerialization", async (req, reply, payload) => {
    if (reply.statusCode >= 400) return payload;
    const contract = responseContracts[`${req.method} ${req.routeOptions.url}`];
    if (!contract) return payload;
    const parsed = contract.safeParse(payload);
    if (!parsed.success)
      throw new AppError(
        "RESPONSE_CONTRACT_INVALID",
        "服务响应未通过契约校验",
        500,
      );
    return parsed.data;
  });
  app.addHook("onRequest", async (req, reply) => {
    reply
      .header("X-Content-Type-Options", "nosniff")
      .header("Referrer-Policy", "no-referrer")
      .header("Cache-Control", "no-store");
    const routePath = req.routeOptions.url ?? req.url.split("?")[0];
    if (!routePath.startsWith("/api/")) return;
    const auth = req.headers.authorization ?? "",
      token = auth.startsWith("Bearer ") ? auth.slice(7) : "";
    const actor =
      token && matches(token, keys.admin)
        ? "admin"
        : token && matches(token, keys.viewer)
          ? "viewer"
          : null;
    if (!actor) throw new AppError("UNAUTHORIZED", "需要有效 API 密钥", 401);
    actors.set(req, actor);
    if (routePath.startsWith("/api/v1/admin/") && actor !== "admin")
      throw new AppError("FORBIDDEN", "此操作需要管理员权限", 403);
  });
  app.setErrorHandler((error, req, reply) => {
    const e =
      error instanceof AppError
        ? error
        : error instanceof ZodError
          ? new AppError("INVALID_REQUEST", "请求字段或类型不合法", 400)
          : error &&
              typeof error === "object" &&
              "statusCode" in error &&
              typeof error.statusCode === "number" &&
              error.statusCode < 500
            ? new AppError(
                "INVALID_REQUEST",
                "请求内容不合法",
                error.statusCode,
              )
            : new AppError(
                "INTERNAL_ERROR",
                "服务暂时不可用；请按 requestId 查询日志",
                500,
              );
    if (e.status === 500)
      app.log.error(
        {
          requestId: req.id,
          errorType: error instanceof Error ? error.name : "Unknown",
        },
        "request failed",
      );
    reply.status(e.status).send({
      error: {
        code: e.code,
        message: e.message,
        requestId: req.id,
        ...(e.details ? { details: e.details } : {}),
      },
    });
  });
  app.get("/api/v1/config", async (req) => ({
    generationEnabled: GENERATION_ENABLED,
    stage: "P1-A",
    role: actors.get(req),
    provider: "libtv",
    ...(await service.cliStatus()),
  }));
  app.get("/api/v1/models", async (req) => {
    const q = listQuery.parse(req.query);
    const rows = await service.listModels(q.type, q.q);
    return { data: z.array(publicModelSchema).parse(rows), total: rows.length };
  });
  app.get<{ Params: { modelKey: string } }>(
    "/api/v1/models/:modelKey/schema",
    async (req) => {
      const q = z
          .object({ mode: z.string().max(80).optional() })
          .strict()
          .parse(req.query),
        model = await service.model(req.params.modelKey);
      return {
        modelKey: model.modelKey,
        directoryModelName: model.directoryModelName,
        availabilityState: model.availabilityState,
        rawSchema: model.modelSchemaJson,
        previousSchema: model.previousSchemaJson,
        changes: model.changesJson,
        schemaHash: model.schemaHash,
        schemaVersion: model.schemaVersion,
        form: normalizeModel(model.modelSchemaJson, model.modality, q.mode),
      };
    },
  );
  app.post<{ Params: { modelKey: string } }>(
    "/api/v1/models/:modelKey/validate",
    async (req) => {
      const input = validateRequest.parse(req.body),
        model = await service.model(req.params.modelKey);
      if (model.availabilityState !== "listed")
        throw new AppError("MODEL_DISABLED", "模型已禁用或不再收录", 409);
      const result = validateParameters(
        model.modelSchemaJson,
        model.modality,
        input.modeType,
        input.parameters,
      );
      await service.audit(
        actors.get(req)!,
        "model.parameters-validated",
        model.modelKey,
        { generationEnabled: false },
      );
      return {
        ...result,
        settingsPreview: serializeSettings(
          model.directoryModelName,
          input.parameters,
        ),
      };
    },
  );
  app.get("/api/v1/connections", async () => {
    const data = await service.connectionViews();
    return { data, total: data.length };
  });
  app.get<{ Params: { modelKey: string } }>(
    "/api/v1/models/:modelKey/route-preview",
    async (req) => {
      z.object({}).strict().parse(req.query);
      return service.previewModelRoute(req.params.modelKey);
    },
  );
  app.get("/api/v1/projects", async () => {
    const data = await service.listProjects();
    return { data, total: data.length };
  });
  app.get<{ Params: { id: string } }>(
    "/api/v1/projects/:id/nodes",
    async (req) => service.nodes(req.params.id),
  );
  app.get("/api/v1/admin/audit-events", async () => {
    const data = await service.logs();
    return { data, total: data.length };
  });
  app.post("/api/v1/admin/models/import-evidence", async (req) => {
    z.object({})
      .strict()
      .parse(req.body ?? {});
    return service.importEvidence(actors.get(req)!);
  });
  app.post("/api/v1/admin/models/sync", async (req) => {
    z.object({})
      .strict()
      .parse(req.body ?? {});
    return service.syncModels(actors.get(req)!);
  });
  app.patch<{ Params: { key: string } }>(
    "/api/v1/admin/models/:key",
    async (req) => {
      const key = modelKeySchema.parse(req.params.key),
        input = z.object({ disabled: z.boolean() }).strict().parse(req.body);
      await service.model(key);
      await service.db
        .update(models)
        .set({
          manuallyDisabled: input.disabled,
          availabilityState: input.disabled ? "disabled" : "unverified",
        })
        .where(eq(models.id, `libtv:${key}`));
      await service.audit(actors.get(req)!, "model.set-disabled", key, input);
      return {
        modelKey: key,
        availabilityState: input.disabled ? "disabled" : "unverified",
      };
    },
  );
  app.patch<{ Params: { id: string } }>(
    "/api/v1/admin/connections/:id",
    async (req) => {
      const input = connectionPatch.parse(req.body);
      const [updated] = await service.db
        .update(connections)
        .set({ ...input, updatedAt: new Date() })
        .where(
          and(eq(connections.id, req.params.id), isNull(connections.removedAt)),
        )
        .returning({ id: connections.id });
      if (!updated)
        throw new AppError("CONNECTION_NOT_FOUND", "连接不存在", 404);
      await service.audit(
        actors.get(req)!,
        "connection.update",
        req.params.id,
        input,
      );
      return { ok: true };
    },
  );
  app.delete<{ Params: { id: string } }>(
    "/api/v1/admin/connections/:id",
    (req) => service.removeConnection(req.params.id, actors.get(req)!),
  );
  app.addHook("onClose", async () => service.closePendingLogin());
  app.get("/api/v1/admin/connections/login", async () =>
    (await service.pendingLoginController()).status(),
  );
  app.post("/api/v1/admin/connections/login", async (req) => {
    const body = z
      .object({ replace: z.boolean().optional() })
      .strict()
      .parse(req.body ?? {});
    return (await service.pendingLoginController()).start(
      body.replace ?? false,
    );
  });
  app.post("/api/v1/admin/connections/login/cancel", async (req) => {
    z.object({})
      .strict()
      .parse(req.body ?? {});
    return (await service.pendingLoginController()).cancelWeb();
  });
  app.post("/api/v1/admin/connections/login/open-browser", async (req) => {
    z.object({})
      .strict()
      .parse(req.body ?? {});
    if (!["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(req.ip))
      throw new AppError(
        "LOCAL_BROWSER_REQUIRED",
        "请在运行 XcAIPool 的电脑上打开登录窗口。",
        403,
      );
    return (await service.pendingLoginController()).openIsolatedBrowser();
  });
  app.post("/api/v1/admin/connections/login/phone", async (req) => {
    const input = z
      .object({
        phone: z.string().regex(/^1[3-9]\d{9}$/),
        code: z
          .string()
          .regex(/^\d{6}$/)
          .optional(),
        replace: z.boolean().optional(),
      })
      .strict()
      .parse(req.body ?? {});
    return (await service.pendingLoginController()).phone(
      input.phone,
      input.code,
      input.replace,
    );
  });
  app.post("/api/v1/admin/connections/register", async (req) => {
    const body = z
      .object({ alias: z.string().trim().min(1).max(80).optional() })
      .strict()
      .parse(req.body ?? {});
    return service.registerAccount(actors.get(req)!, body.alias);
  });
  app.post<{ Params: { id: string } }>(
    "/api/v1/admin/connections/:id/diagnose",
    async (req) => {
      z.object({})
        .strict()
        .parse(req.body ?? {});
      return service.diagnose(req.params.id, actors.get(req)!);
    },
  );
  app.post("/api/v1/admin/projects/discover", async (req) => {
    const { connectionId } = z
      .object({
        connectionId: z
          .string()
          .regex(/^account-\d{2,6}$/)
          .optional(),
      })
      .strict()
      .parse(req.body ?? {});
    return service.discoverProjects(actors.get(req)!, connectionId);
  });
  app.post<{ Params: { id: string } }>(
    "/api/v1/admin/projects/:id/refresh",
    async (req) => {
      z.object({})
        .strict()
        .parse(req.body ?? {});
      return service.refreshProject(req.params.id, actors.get(req)!);
    },
  );
  app.post("/api/v1/tasks", async (req) => {
    await service.audit(actors.get(req)!, "generation.blocked", "global", {
      generationEnabled: false,
    });
    throw new AppError(
      "GENERATION_DISABLED",
      "P1-A 真实生成硬关闭；Mock 队列在 P1-B 实施",
      403,
    );
  });
  app.get("/api/v1/tasks", async () => service.generationRecords());
  app.get<{ Params: { id: string } }>("/api/v1/tasks/:id", async (req) => {
    return service.generationRecords(
      z
        .string()
        .regex(/^[a-z0-9-]{1,120}$/)
        .parse(req.params.id),
    );
  });
  registerUpdateRoutes(app, service.root);
  if (
    serveWeb &&
    existsSync(path.join(service.root, "dist/admin/index.html"))
  ) {
    app.register(fastifyStatic, {
      root: path.join(service.root, "dist/admin"),
      prefix: "/",
    });
    app.setNotFoundHandler((req, reply) =>
      req.url.startsWith("/api/")
        ? reply.code(404).send({
            error: {
              code: "NOT_FOUND",
              message: "接口不存在",
              requestId: req.id,
            },
          })
        : reply.sendFile("index.html"),
    );
  }
  return app;
}
