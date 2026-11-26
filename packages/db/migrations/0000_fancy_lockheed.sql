CREATE TABLE "audit_events" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" text NOT NULL,
	"action" text NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"redacted_metadata" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "canvas_nodes" (
	"id" text PRIMARY KEY NOT NULL,
	"project_id" text NOT NULL,
	"node_key" text NOT NULL,
	"display_name" text NOT NULL,
	"node_type" text NOT NULL,
	"raw_payload_json" jsonb NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "provider_connections" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"alias" text NOT NULL,
	"auth_mode" text DEFAULT 'official_cli' NOT NULL,
	"credential_ref" text NOT NULL,
	"config_dir_ref" text NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"generation_blocked_reason" text,
	"health_status" text DEFAULT 'unchecked' NOT NULL,
	"concurrency_limit" integer DEFAULT 1 NOT NULL,
	"owner_id" text DEFAULT 'local-admin' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_checked_at" timestamp with time zone,
	"diagnosis_json" jsonb
);
--> statement-breakpoint
CREATE TABLE "provider_models" (
	"id" text PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"model_key" text NOT NULL,
	"directory_model_name" text NOT NULL,
	"schema_model_name" text NOT NULL,
	"modality" text NOT NULL,
	"model_schema_json" jsonb NOT NULL,
	"schema_hash" text NOT NULL,
	"schema_version" integer DEFAULT 1 NOT NULL,
	"last_synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	"availability_state" text DEFAULT 'listed' NOT NULL,
	"manually_disabled" boolean DEFAULT false NOT NULL,
	"previous_schema_json" jsonb,
	"changes_json" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "projects" (
	"id" text PRIMARY KEY NOT NULL,
	"connection_id" text NOT NULL,
	"project_uuid" text NOT NULL,
	"title" text NOT NULL,
	"source" text NOT NULL,
	"last_checked_at" timestamp with time zone,
	"snapshot_at" timestamp with time zone,
	"edges_json" jsonb DEFAULT '[]'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "canvas_nodes" ADD CONSTRAINT "canvas_nodes_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_connection_id_provider_connections_id_fk" FOREIGN KEY ("connection_id") REFERENCES "public"."provider_connections"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_node_key" ON "canvas_nodes" USING btree ("project_id","node_key");--> statement-breakpoint
CREATE UNIQUE INDEX "provider_model_key" ON "provider_models" USING btree ("provider","model_key");--> statement-breakpoint
CREATE UNIQUE INDEX "connection_project_uuid" ON "projects" USING btree ("connection_id","project_uuid");