import { z } from "zod";
export const GENERATION_ENABLED = false as const;
export const modelKeySchema = z.string().regex(/^[\w.-]{1,150}$/);
export const uuidSchema = z.string().regex(/^[a-f0-9]{32}$/i);
export const listQuery = z
  .object({
    type: z.enum(["image", "video"]).optional(),
    q: z.string().max(150).optional(),
  })
  .strict();
export const validateRequest = z
  .object({
    modeType: z.string().min(1).max(80),
    parameters: z.record(z.string(), z.unknown()),
  })
  .strict();
export const connectionPatch = z
  .object({
    alias: z.string().trim().min(1).max(80).optional(),
    enabled: z.boolean().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0);
export const errorEnvelope = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    requestId: z.string(),
    details: z.unknown().optional(),
  }),
});
export type Modality = "image" | "video";
export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
    public details?: unknown,
  ) {
    super(message);
  }
}
export const publicModelSchema = z.object({
  id: z.string(),
  modelKey: z.string(),
  directoryModelName: z.string(),
  schemaModelName: z.string(),
  modality: z.enum(["image", "video"]),
  availabilityState: z.enum(["listed", "unverified", "disabled"]),
  generationPermission: z.literal("unverified"),
  schemaHash: z.string(),
  schemaVersion: z.number(),
  lastSyncedAt: z.string(),
});
const timestampString = z.string().nullable();
const envelope = (item: z.ZodType) =>
  z
    .object({ data: z.array(item), total: z.number().int().nonnegative() })
    .strict();
const diagnosisSchema = z
  .object({
    authenticated: z.literal(true),
    identity: z.string(),
    activeSpace: z.string(),
    spacesCount: z.number(),
    membershipEffective: z.boolean(),
  })
  .strict();
export const responseContracts: Record<string, z.ZodType> = {
  "GET /api/v1/models/:modelKey/schema": z
    .object({
      modelKey: modelKeySchema,
      directoryModelName: z.string(),
      availabilityState: publicModelSchema.shape.availabilityState,
      rawSchema: z.record(z.string(), z.unknown()),
      previousSchema: z.record(z.string(), z.unknown()).nullable(),
      changes: z.array(z.string()),
      schemaHash: z.string(),
      schemaVersion: z.number().int(),
      form: z
        .object({
          mode: z.string(),
          modes: z.array(z.string()),
          jsonSchema: z.record(z.string(), z.unknown()),
          validationSchema: z.record(z.string(), z.unknown()),
          canValidate: z.boolean(),
          warnings: z.array(z.string()),
          validationScope: z.literal("parameters-only"),
          upstreamPermissionVerified: z.literal(false),
          schemaModelName: z.string(),
        })
        .strict(),
    })
    .strict(),
  "POST /api/v1/models/:modelKey/validate": z
    .object({
      valid: z.literal(true),
      generationEnabled: z.literal(false),
      upstreamValidated: z.literal(false),
      warnings: z.array(z.string()),
      modeType: z.string(),
      settingsPreview: z.array(z.string()),
    })
    .strict(),
  "GET /api/v1/config": z
    .object({
      generationEnabled: z.literal(false),
      stage: z.literal("P1-A"),
      role: z.enum(["admin", "viewer"]),
      provider: z.literal("libtv"),
      cliVersion: z.string().nullable(),
      cliStatus: z.enum(["ready", "unavailable", "incompatible"]),
    })
    .strict(),
  "GET /api/v1/models": envelope(publicModelSchema.strict()),
  "GET /api/v1/connections": envelope(
    z
      .object({
        id: z.string(),
        provider: z.string(),
        alias: z.string(),
        enabled: z.boolean(),
        healthStatus: z.string(),
        generationBlockedReason: z.string().nullable(),
        lastCheckedAt: timestampString,
        concurrencyLimit: z.number(),
        identity: z.string(),
        credentialPresent: z.boolean(),
        isolatedDirectory: z.boolean(),
        diagnosis: diagnosisSchema.nullable(),
        scope: z.string(),
      })
      .strict(),
  ),
  "GET /api/v1/projects": envelope(
    z
      .object({
        id: z.string(),
        connectionId: z.string(),
        projectUuid: uuidSchema,
        title: z.string(),
        source: z.string(),
        lastCheckedAt: timestampString,
        snapshotAt: timestampString,
        canvasUrl: z.url(),
      })
      .strict(),
  ),
  "GET /api/v1/projects/:id/nodes": z
    .object({
      id: z.string(),
      projectUuid: uuidSchema,
      source: z.string(),
      lastCheckedAt: timestampString,
      snapshotAt: timestampString,
      nodes: z.array(
        z
          .object({
            id: z.string(),
            nodeKey: z.string(),
            displayName: z.string(),
            nodeType: z.string(),
            position: z.object({ x: z.number(), y: z.number() }).optional(),
          })
          .strict(),
      ),
      edges: z.array(
        z
          .object({ id: z.string(), source: z.string(), target: z.string() })
          .strict(),
      ),
    })
    .strict(),
  "GET /api/v1/admin/audit-events": envelope(
    z
      .object({
        id: z.string(),
        actorId: z.string(),
        action: z.string(),
        entityType: z.string(),
        entityId: z.string(),
        redactedMetadata: z.record(z.string(), z.unknown()),
        createdAt: z.string(),
      })
      .strict(),
  ),
};
