import { readFile, access } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { eq, desc } from "drizzle-orm";
import type { Database } from "../../../packages/db/src/index.js";
import {
  models,
  connections,
  projects,
  canvasNodes,
  auditEvents,
} from "../../../packages/db/src/schema.js";
import {
  normalizeModel,
  schemaHash,
  changedPaths,
} from "../../../packages/model-normalizer/src/index.js";
import {
  AppError,
  modelKeySchema,
  uuidSchema,
} from "../../../packages/contracts/src/index.js";
import {
  LibTVCLIAdapter,
  createReadOnlyRunner,
  redact,
} from "../../../packages/libtv-cli-adapter/src/index.js";

export class FramePoolService {
  private syncing = false;
  constructor(
    public db: Database,
    public root: string,
    private adapterFactory?: (id: string) => LibTVCLIAdapter,
  ) {}
  async audit(
    actor: string,
    action: string,
    entityId: string,
    metadata: Record<string, any> = {},
  ) {
    await this.db.insert(auditEvents).values({
      id: randomUUID(),
      actorId: actor,
      action,
      entityType: "framepool",
      entityId,
      redactedMetadata: redact(metadata),
    });
  }
  async adapter(id: string) {
    const [connection] = await this.db
      .select()
      .from(connections)
      .where(eq(connections.id, id));
    if (!connection)
      throw new AppError("CONNECTION_NOT_FOUND", "连接不存在", 404);
    if (!connection.enabled)
      throw new AppError("CONNECTION_DISABLED", "连接已手动停用", 409);
    return this.readAdapter(id);
  }
  private accountDirectory(id: string) {
    if (id === "account-02")
      return path.join(this.root, ".local/framepool-p1/accounts/account-02");
    if (id !== "account-01")
      throw new AppError(
        "CONNECTION_NOT_AUTHORIZED",
        "未知 LibTV 连接目录",
        403,
      );
    return path.resolve(
      this.root,
      process.env.LIBTV_ACCOUNT_ROOT ?? ".local/libtv-p0/accounts",
      id,
    );
  }
  private async readAdapter(id: string) {
    const dir = this.accountDirectory(id);
    if (this.adapterFactory) return this.adapterFactory(id);
    const configDir = path.join(dir, "config"),
      workDir = path.join(dir, "work");
    const adapter = new LibTVCLIAdapter(
      createReadOnlyRunner({
        binary: path.resolve(
          this.root,
          process.env.LIBTV_BINARY ??
            ".local/libtv-p0/bin/libtv-win-x64/libtv.exe",
        ),
        configDir,
        workDir,
        onResult: async (args, result) =>
          this.audit("cli", "cli.read", id, {
            args,
            pid: result.pid,
            exitCode: result.code,
            durationMs: result.durationMs,
            stderr: result.stderr,
          }),
      }),
    );
    await adapter.version();
    return adapter;
  }
  async evidence(name: string) {
    return JSON.parse(
      (
        await readFile(path.join(this.root, "docs/p0/evidence", name), "utf8")
      ).replace(/^\uFEFF/, ""),
    );
  }
  async importEvidence(actor: string) {
    const entries: any[] = [];
    for (const type of ["image", "video"] as const) {
      const record = await this.evidence(`models-${type}.json`);
      if (record.code !== 0)
        throw new AppError("EVIDENCE_INVALID", "模型目录证据失败", 422);
      const catalog = JSON.parse(record.stdout);
      for (const item of catalog.matches) {
        modelKeySchema.parse(item.modelKey);
        const raw = JSON.parse(
          (
            await readFile(
              path.join(this.root, "docs/p0/schemas", `${item.modelKey}.json`),
              "utf8",
            )
          ).replace(/^\uFEFF/, ""),
        );
        if (
          raw.modelKey !== item.modelKey ||
          raw.modality !== type ||
          !item.modelName
        )
          throw new AppError("EVIDENCE_INVALID", "目录与 Schema 不一致", 422);
        normalizeModel(raw, type);
        entries.push({
          key: item.modelKey,
          name: item.modelName,
          type,
          raw,
          syncedAt: new Date(record.finishedAt),
        });
      }
    }
    if (entries.length !== 65 || new Set(entries.map((e) => e.key)).size !== 65)
      throw new AppError("EVIDENCE_INVALID", "P0 应有 65 个唯一模型", 422);
    const snapshotRecord = await this.evidence("canvas-snapshot.json"),
      snapshot = JSON.parse(snapshotRecord.stdout);
    uuidSchema.parse(snapshot.projectUuid);
    const failures = await Promise.all(
      ["image-run.json", "video-run.json"].map((n) => this.evidence(n)),
    );
    await this.db.transaction(async (tx) => {
      await tx
        .insert(connections)
        .values({
          id: "account-01",
          provider: "libtv",
          alias: "LibTV · 主账号",
          credentialRef: "p0/account-01",
          configDirRef: "account-01",
          generationBlockedReason: "LIBTV_GALLERY_CAPACITY_BLOCKED",
        })
        .onConflictDoNothing();
      for (const e of entries) {
        const [old] = await tx
          .select()
          .from(models)
          .where(eq(models.id, `libtv:${e.key}`));
        const hash = schemaHash(e.raw);
        if (old && old.schemaHash === hash) continue;
        // Re-import must not roll an online-synced model back to older evidence.
        if (old && old.lastSyncedAt > e.syncedAt) continue;
        await tx
          .insert(models)
          .values({
            id: `libtv:${e.key}`,
            provider: "libtv",
            modelKey: e.key,
            directoryModelName: e.name,
            schemaModelName: e.raw.schema.modelName ?? "",
            modality: e.type,
            modelSchemaJson: e.raw,
            schemaHash: hash,
            lastSyncedAt: e.syncedAt,
          })
          .onConflictDoUpdate({
            target: models.id,
            set: {
              modelSchemaJson: e.raw,
              schemaHash: hash,
              schemaVersion: (old?.schemaVersion ?? 0) + 1,
              previousSchemaJson: old?.modelSchemaJson ?? null,
              changesJson: old ? changedPaths(old.modelSchemaJson, e.raw) : [],
              directoryModelName: e.name,
              schemaModelName: e.raw.schema.modelName ?? "",
              lastSyncedAt: e.syncedAt,
            },
          });
      }
      await tx
        .insert(projects)
        .values({
          id: "p0-canvas",
          connectionId: "account-01",
          projectUuid: snapshot.projectUuid,
          title: "FramePool P0 20261118",
          source: "p0-evidence",
          snapshotAt: new Date(snapshotRecord.finishedAt),
          edgesJson: snapshot.edges,
        })
        .onConflictDoNothing();
      for (const n of snapshot.nodes)
        await tx
          .insert(canvasNodes)
          .values({
            id: `p0-canvas:${n.id}`,
            projectId: "p0-canvas",
            nodeKey: n.id,
            displayName: n.name,
            nodeType: n.type,
            rawPayloadJson: n,
          })
          .onConflictDoNothing();
      for (const [index, failure] of failures.entries())
        await tx
          .insert(auditEvents)
          .values({
            id: `p0-generation-failed-${index}`,
            actorId: "p0",
            action: "p0.generation_failed",
            entityType: "node",
            entityId: failure.args[1],
            createdAt: new Date(failure.finishedAt),
            redactedMetadata: {
              origin: "p0-evidence",
              errorCode: "LIBTV_GALLERY_CAPACITY_BLOCKED",
              upstreamCode: "1200000138",
              exitCode: failure.code,
              nodeKey: failure.args[1],
              hasGeneratedOutput: false,
            },
          })
          .onConflictDoNothing();
    });
    await this.audit(actor, "models.import-evidence", "libtv", {
      count: entries.length,
    });
    return {
      imported: entries.length,
      image: entries.filter((e) => e.type === "image").length,
      video: entries.filter((e) => e.type === "video").length,
    };
  }
  async listModels(type?: string, q?: string) {
    const rows = await this.db
      .select()
      .from(models)
      .orderBy(models.modality, models.modelKey);
    return rows
      .filter(
        (m) =>
          (!type || m.modality === type) &&
          (!q ||
            `${m.modelKey} ${m.directoryModelName}`
              .toLowerCase()
              .includes(q.toLowerCase())),
      )
      .map((m) => ({
        id: m.modelKey,
        modelKey: m.modelKey,
        directoryModelName: m.directoryModelName,
        schemaModelName: m.schemaModelName,
        modality: m.modality,
        availabilityState: m.availabilityState,
        generationPermission: "unverified" as const,
        schemaHash: m.schemaHash,
        schemaVersion: m.schemaVersion,
        lastSyncedAt: m.lastSyncedAt.toISOString(),
      }));
  }
  async model(key: string) {
    modelKeySchema.parse(key);
    const [row] = await this.db
      .select()
      .from(models)
      .where(eq(models.id, `libtv:${key}`));
    if (!row) throw new AppError("MODEL_NOT_FOUND", "模型不存在", 404);
    return row;
  }
  async connectionViews() {
    const rows = await this.db.select().from(connections);
    return Promise.all(
      rows.map(async (c) => {
        let credentialPresent = false;
        try {
          await access(
            path.join(
              this.accountDirectory(c.id),
              "config",
              "credentials.json",
            ),
          );
          credentialPresent = true;
        } catch {
          /* Presence is a diagnostic; never inspect credential content. */
        }
        return {
          id: c.id,
          provider: c.provider,
          alias: c.alias,
          enabled: c.enabled,
          healthStatus: c.healthStatus,
          generationBlockedReason: c.generationBlockedReason,
          lastCheckedAt: c.lastCheckedAt?.toISOString() ?? null,
          concurrencyLimit: c.concurrencyLimit,
          identity: "身份已脱敏",
          credentialPresent,
          isolatedDirectory: true,
          diagnosis: c.diagnosisJson,
          scope: "独立登录用户；个人/团队是其内部空间",
        };
      }),
    );
  }
  async previewModelRoute(key: string) {
    const model = await this.model(key);
    if (model.availabilityState !== "listed")
      throw new AppError("MODEL_DISABLED", "模型未收录或已停用", 409);
    const rows = (await this.connectionViews()).sort((a, b) =>
      a.id.localeCompare(b.id),
    );
    const accounts = await Promise.all(
      rows.map(async (account) => {
        const base = {
          connectionId: account.id,
          previousGenerationBlock: account.generationBlockedReason,
        };
        if (!account.enabled || !account.credentialPresent) {
          return {
            ...base,
            status: account.enabled ? "missing_credentials" : "disabled",
          };
        }
        try {
          const adapter = await this.adapter(account.id);
          await adapter.accountInfo();
          const catalog = await adapter.searchModels(model.modality);
          return {
            ...base,
            status: catalog.some(
              (item: { modelKey?: string }) => item?.modelKey === key,
            )
              ? "listed"
              : "not_listed",
          };
        } catch (error) {
          if (!(error instanceof AppError)) throw error;
          return { ...base, status: "check_failed", errorCode: error.code };
        }
      }),
    );
    return {
      modelKey: key,
      modality: model.modality,
      generationEnabled: false,
      generationPermission: "unverified",
      accounts,
    };
  }
  async registerSecondAccount(actor: string) {
    const id = "account-02";
    try {
      await access(
        path.join(this.accountDirectory(id), "config", "credentials.json"),
      );
    } catch {
      throw new AppError(
        "LIBTV_LOGIN_REQUIRED",
        "请先完成第二个账号的 LibTV 官方网页登录",
        409,
      );
    }
    const current = await (
      await this.readAdapter("account-01")
    ).accountIdentity();
    const candidate = await (await this.readAdapter(id)).accountIdentity();
    if (!current.userUuid || !candidate.userUuid)
      throw new AppError(
        "CLI_RESPONSE_INVALID",
        "无法核验 LibTV 登录用户身份",
        502,
      );
    if (current.userUuid === candidate.userUuid)
      throw new AppError(
        "LIBTV_DUPLICATE_USER",
        "登录的是已有 LibTV 用户。请用浏览器隐私窗口登录另一个用户。",
        409,
      );
    const checkedAt = new Date();
    const diagnosis = {
      diagnosisJson: candidate.diagnosis,
      healthStatus: "authenticated",
      lastCheckedAt: checkedAt,
      updatedAt: checkedAt,
    };
    await this.db
      .insert(connections)
      .values({
        id,
        provider: "libtv",
        alias: "LibTV · 第二账号",
        credentialRef: "local/account-02",
        configDirRef: id,
        ...diagnosis,
      })
      .onConflictDoUpdate({ target: connections.id, set: diagnosis });
    await this.audit(actor, "connection.register", id, { authenticated: true });
    return { id, authenticated: true };
  }
  async diagnose(id: string, actor: string) {
    try {
      const adapter = await this.adapter(id),
        diagnosis = await adapter.accountInfo();
      await this.db
        .update(connections)
        .set({
          healthStatus: "authenticated",
          diagnosisJson: diagnosis,
          lastCheckedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(connections.id, id));
      await this.audit(actor, "connection.diagnose", id, {
        authenticated: true,
      });
      return diagnosis;
    } catch (error) {
      if (error instanceof AppError && error.code === "CONNECTION_DISABLED")
        throw error;
      await this.db
        .update(connections)
        .set({
          healthStatus: "error",
          lastCheckedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(connections.id, id));
      await this.audit(actor, "connection.diagnose_failed", id, {
        code: error instanceof AppError ? error.code : "UNKNOWN",
      });
      throw error;
    }
  }
  async syncModels(actor: string) {
    if (this.syncing)
      throw new AppError("SYNC_IN_PROGRESS", "模型同步进行中", 409);
    this.syncing = true;
    try {
      const adapter = await this.adapter("account-01");
      const entries: any[] = [];
      for (const type of ["image", "video"] as const)
        for (const item of await adapter.searchModels(type)) {
          const raw = await adapter.getModelSchema(item.modelKey);
          if (raw.modelKey !== item.modelKey)
            throw new AppError(
              "CLI_RESPONSE_INVALID",
              "在线 Schema 与目录不一致",
              502,
            );
          normalizeModel(raw, type);
          entries.push({ key: item.modelKey, name: item.modelName, type, raw });
        }
      if (!entries.length)
        throw new AppError(
          "EMPTY_MODEL_CATALOG",
          "在线目录为空，未变更现有模型",
          502,
        );
      await this.db.transaction(async (tx) => {
        const oldRows = await tx.select().from(models),
          seen = new Set(entries.map((e) => e.key));
        for (const old of oldRows)
          if (!seen.has(old.modelKey) && !old.manuallyDisabled)
            await tx
              .update(models)
              .set({ availabilityState: "unverified" })
              .where(eq(models.id, old.id));
        for (const e of entries) {
          const old = oldRows.find((m) => m.modelKey === e.key),
            hash = schemaHash(e.raw),
            changed = old?.schemaHash !== hash;
          await tx
            .insert(models)
            .values({
              id: `libtv:${e.key}`,
              provider: "libtv",
              modelKey: e.key,
              directoryModelName: e.name,
              schemaModelName: e.raw.schema.modelName ?? "",
              modality: e.type,
              modelSchemaJson: e.raw,
              schemaHash: hash,
            })
            .onConflictDoUpdate({
              target: models.id,
              set: {
                directoryModelName: e.name,
                schemaModelName: e.raw.schema.modelName ?? "",
                modelSchemaJson: e.raw,
                schemaHash: hash,
                schemaVersion: changed
                  ? (old?.schemaVersion ?? 0) + 1
                  : old!.schemaVersion,
                lastSyncedAt: new Date(),
                availabilityState: old?.manuallyDisabled
                  ? "disabled"
                  : "listed",
                ...(changed
                  ? {
                      previousSchemaJson: old?.modelSchemaJson ?? null,
                      changesJson: old
                        ? changedPaths(old.modelSchemaJson, e.raw)
                        : [],
                    }
                  : {}),
              },
            });
        }
      });
      await this.audit(actor, "models.sync", "account-01", {
        count: entries.length,
      });
      return { synced: entries.length };
    } finally {
      this.syncing = false;
    }
  }
  async project(id: string) {
    const [p] = await this.db
      .select()
      .from(projects)
      .where(eq(projects.id, id));
    if (!p) throw new AppError("PROJECT_NOT_FOUND", "画布不存在", 404);
    return p;
  }
  async listProjects() {
    return (await this.db.select().from(projects)).map((p) => ({
      id: p.id,
      connectionId: p.connectionId,
      projectUuid: p.projectUuid,
      title: p.title,
      source: p.source,
      lastCheckedAt: p.lastCheckedAt?.toISOString() ?? null,
      snapshotAt: p.snapshotAt?.toISOString() ?? null,
      canvasUrl: `https://www.liblib.tv/canvas?projectId=${p.projectUuid}`,
    }));
  }
  async nodes(id: string) {
    const p = await this.project(id);
    const nodes = await this.db
      .select()
      .from(canvasNodes)
      .where(eq(canvasNodes.projectId, id));
    return {
      id: p.id,
      projectUuid: p.projectUuid,
      source: p.source,
      lastCheckedAt: p.lastCheckedAt?.toISOString() ?? null,
      nodes: nodes.map((n) => ({
        id: n.nodeKey,
        nodeKey: n.nodeKey,
        displayName: n.displayName,
        nodeType: n.nodeType,
        position: n.rawPayloadJson.position,
      })),
      edges: p.edgesJson,
    };
  }
  async refreshProject(id: string, actor: string) {
    const p = await this.project(id),
      adapter = await this.adapter(p.connectionId),
      snapshot = await adapter.canvas(p.projectUuid);
    await this.db.transaction(async (tx) => {
      await tx.delete(canvasNodes).where(eq(canvasNodes.projectId, id));
      for (const n of snapshot.nodes)
        await tx.insert(canvasNodes).values({
          id: `${id}:${n.nodeKey}`,
          projectId: id,
          nodeKey: n.nodeKey,
          displayName: n.displayName,
          nodeType: n.nodeType,
          rawPayloadJson: n,
        });
      await tx
        .update(projects)
        .set({
          edgesJson: snapshot.edges,
          source: "upstream",
          lastCheckedAt: new Date(),
          snapshotAt: new Date(),
        })
        .where(eq(projects.id, id));
    });
    await this.audit(actor, "project.read-upstream", id, {
      nodes: snapshot.nodes.length,
      edges: snapshot.edges.length,
    });
    return this.nodes(id);
  }
  async discoverProjects(actor: string) {
    const adapter = await this.adapter("account-01"),
      list = await adapter.listProjects();
    for (const p of list) {
      uuidSchema.parse(p.projectUuid);
      await this.db
        .insert(projects)
        .values({
          id: `account-01:${p.projectUuid}`,
          connectionId: "account-01",
          projectUuid: p.projectUuid,
          title: p.title,
          source: "upstream",
          lastCheckedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [projects.connectionId, projects.projectUuid],
          set: { title: p.title, lastCheckedAt: new Date() },
        });
    }
    await this.audit(actor, "projects.discover", "account-01", {
      count: list.length,
    });
    return { discovered: list.length };
  }
  async logs() {
    return (
      await this.db
        .select()
        .from(auditEvents)
        .orderBy(desc(auditEvents.createdAt))
        .limit(200)
    ).map((e) => ({ ...e, createdAt: e.createdAt.toISOString() }));
  }
}
