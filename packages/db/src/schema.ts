import {
  pgTable,
  text,
  boolean,
  integer,
  jsonb,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
const stamp = () => timestamp({ withTimezone: true }).notNull().defaultNow();
export const connections = pgTable("provider_connections", {
  id: text().primaryKey(),
  provider: text().notNull(),
  alias: text().notNull(),
  authMode: text().notNull().default("official_cli"),
  credentialRef: text().notNull(),
  configDirRef: text().notNull(),
  enabled: boolean().notNull().default(true),
  generationBlockedReason: text(),
  healthStatus: text().notNull().default("unchecked"),
  concurrencyLimit: integer().notNull().default(1),
  ownerId: text().notNull().default("local-admin"),
  createdAt: stamp(),
  updatedAt: stamp(),
  lastCheckedAt: timestamp({ withTimezone: true }),
  removedAt: timestamp({ withTimezone: true }),
  diagnosisJson: jsonb().$type<Record<string, unknown>>(),
});
export const models = pgTable(
  "provider_models",
  {
    id: text().primaryKey(),
    provider: text().notNull(),
    modelKey: text().notNull(),
    directoryModelName: text().notNull(),
    schemaModelName: text().notNull(),
    modality: text().$type<"image" | "video">().notNull(),
    modelSchemaJson: jsonb().$type<Record<string, any>>().notNull(),
    schemaHash: text().notNull(),
    schemaVersion: integer().notNull().default(1),
    lastSyncedAt: stamp(),
    availabilityState: text()
      .$type<"listed" | "unverified" | "disabled">()
      .notNull()
      .default("listed"),
    manuallyDisabled: boolean().notNull().default(false),
    previousSchemaJson: jsonb().$type<Record<string, any>>(),
    changesJson: jsonb().$type<string[]>().notNull().default([]),
  },
  (table) => [
    uniqueIndex("provider_model_key").on(table.provider, table.modelKey),
  ],
);
export const projects = pgTable(
  "projects",
  {
    id: text().primaryKey(),
    connectionId: text()
      .notNull()
      .references(() => connections.id),
    projectUuid: text().notNull(),
    title: text().notNull(),
    source: text().notNull(),
    lastCheckedAt: timestamp({ withTimezone: true }),
    snapshotAt: timestamp({ withTimezone: true }),
    edgesJson: jsonb().$type<any[]>().notNull().default([]),
  },
  (t) => [
    uniqueIndex("connection_project_uuid").on(t.connectionId, t.projectUuid),
  ],
);
export const canvasNodes = pgTable(
  "canvas_nodes",
  {
    id: text().primaryKey(),
    projectId: text()
      .notNull()
      .references(() => projects.id),
    nodeKey: text().notNull(),
    displayName: text().notNull(),
    nodeType: text().notNull(),
    rawPayloadJson: jsonb().$type<Record<string, any>>().notNull(),
    updatedAt: stamp(),
  },
  (t) => [uniqueIndex("project_node_key").on(t.projectId, t.nodeKey)],
);
export const auditEvents = pgTable("audit_events", {
  id: text().primaryKey(),
  actorId: text().notNull(),
  action: text().notNull(),
  entityType: text().notNull(),
  entityId: text().notNull(),
  redactedMetadata: jsonb().$type<Record<string, any>>().notNull(),
  createdAt: stamp(),
});
