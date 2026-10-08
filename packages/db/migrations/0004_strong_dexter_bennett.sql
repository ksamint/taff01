-- Drizzle emits added unique constraints after FKs; this referenced key must exist first.
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_workspace_id_unique" UNIQUE("workspace_id","id");
--> statement-breakpoint
CREATE TYPE "public"."grant_status" AS ENUM('pending', 'allowed', 'denied', 'revoked');--> statement-breakpoint
CREATE TYPE "public"."permission_decision" AS ENUM('allow', 'ask', 'deny');--> statement-breakpoint
CREATE TYPE "public"."review_policy" AS ENUM('always_review', 'ask_only');--> statement-breakpoint
CREATE TYPE "public"."run_status" AS ENUM('running', 'paused', 'needs_review', 'changes_requested', 'completed', 'canceled', 'failed');--> statement-breakpoint
CREATE TABLE "agent_permissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"capability" text NOT NULL,
	"decision" "permission_decision" NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_permissions_agent_capability" UNIQUE("agent_id","capability")
);
--> statement-breakpoint
CREATE TABLE "agent_profiles" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"supervisor_id" uuid,
	"review_policy" "review_policy" DEFAULT 'always_review' NOT NULL,
	"max_duration_ms" bigint,
	"max_cost_micros" bigint,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "agent_profiles_limits" CHECK (("agent_profiles"."max_duration_ms" IS NULL OR "agent_profiles"."max_duration_ms" > 0) AND ("agent_profiles"."max_cost_micros" IS NULL OR "agent_profiles"."max_cost_micros" > 0))
);
--> statement-breakpoint
CREATE TABLE "grants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"capability" text NOT NULL,
	"task_id" uuid,
	"run_id" uuid,
	"status" "grant_status" DEFAULT 'pending' NOT NULL,
	"reason" text NOT NULL,
	"expires_at" timestamp with time zone,
	"decided_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "grants_workspace_id_unique" UNIQUE("workspace_id","id")
);
--> statement-breakpoint
CREATE TABLE "inbox_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"agent_id" uuid,
	"task_id" uuid,
	"run_id" uuid,
	"grant_id" uuid,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"read_at" timestamp with time zone,
	"snoozed_until" timestamp with time zone,
	"resolved_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "inbox_items_kind" CHECK ("inbox_items"."kind" IN ('review','blocker','mention'))
);
--> statement-breakpoint
CREATE TABLE "review_checks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"matches_description" boolean NOT NULL,
	"verifiable" boolean NOT NULL,
	"within_permissions" boolean NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"body" text NOT NULL,
	"artifact_id" uuid,
	"event_id" uuid,
	"line" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "review_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"artifact_id" uuid NOT NULL,
	"decision" text NOT NULL,
	"reviewed_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "review_items_decision" CHECK ("review_items"."decision" IN ('approve','request_changes'))
);
--> statement-breakpoint
CREATE TABLE "run_artifacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"name" text NOT NULL,
	"mime_type" text NOT NULL,
	"content" text NOT NULL,
	"diff" text,
	"source_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "run_artifacts_workspace_run_id_unique" UNIQUE("workspace_id","run_id","id")
);
--> statement-breakpoint
CREATE TABLE "run_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"run_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"title" text NOT NULL,
	"text" text DEFAULT '' NOT NULL,
	"source_url" text,
	"test_status" text,
	"duration_ms" bigint DEFAULT 0 NOT NULL,
	"cost_micros" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "run_events_workspace_run_id_unique" UNIQUE("workspace_id","run_id","id"),
	CONSTRAINT "run_events_kind" CHECK ("run_events"."kind" IN ('step','tool_call','message','source','test')),
	CONSTRAINT "run_events_metrics" CHECK ("run_events"."duration_ms" >= 0 AND "run_events"."cost_micros" >= 0)
);
--> statement-breakpoint
CREATE TABLE "runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"agent_id" uuid NOT NULL,
	"status" "run_status" DEFAULT 'running' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"duration_ms" bigint DEFAULT 0 NOT NULL,
	"cost_micros" bigint DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "runs_workspace_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "runs_metrics" CHECK ("runs"."version" > 0 AND "runs"."duration_ms" >= 0 AND "runs"."cost_micros" >= 0)
);
--> statement-breakpoint
ALTER TABLE "agent_permissions" ADD CONSTRAINT "agent_permissions_member_fk" FOREIGN KEY ("workspace_id","agent_id") REFERENCES "public"."members"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_profiles" ADD CONSTRAINT "agent_profiles_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_profiles" ADD CONSTRAINT "agent_profiles_member_fk" FOREIGN KEY ("workspace_id","id") REFERENCES "public"."members"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agent_profiles" ADD CONSTRAINT "agent_profiles_supervisor_fk" FOREIGN KEY ("workspace_id","supervisor_id") REFERENCES "public"."members"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grants" ADD CONSTRAINT "grants_agent_fk" FOREIGN KEY ("workspace_id","agent_id") REFERENCES "public"."members"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grants" ADD CONSTRAINT "grants_task_fk" FOREIGN KEY ("workspace_id","task_id") REFERENCES "public"."tasks"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grants" ADD CONSTRAINT "grants_run_fk" FOREIGN KEY ("workspace_id","run_id") REFERENCES "public"."runs"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "grants" ADD CONSTRAINT "grants_decider_fk" FOREIGN KEY ("workspace_id","decided_by") REFERENCES "public"."members"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_member_fk" FOREIGN KEY ("workspace_id","member_id") REFERENCES "public"."members"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_task_fk" FOREIGN KEY ("workspace_id","task_id") REFERENCES "public"."tasks"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_run_fk" FOREIGN KEY ("workspace_id","run_id") REFERENCES "public"."runs"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_grant_fk" FOREIGN KEY ("workspace_id","grant_id") REFERENCES "public"."grants"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_checks" ADD CONSTRAINT "review_checks_run_fk" FOREIGN KEY ("workspace_id","id") REFERENCES "public"."runs"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_comments" ADD CONSTRAINT "review_comments_run_fk" FOREIGN KEY ("workspace_id","run_id") REFERENCES "public"."runs"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_comments" ADD CONSTRAINT "review_comments_author_fk" FOREIGN KEY ("workspace_id","author_id") REFERENCES "public"."members"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_comments" ADD CONSTRAINT "review_comments_artifact_fk" FOREIGN KEY ("workspace_id","run_id","artifact_id") REFERENCES "public"."run_artifacts"("workspace_id","run_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_comments" ADD CONSTRAINT "review_comments_event_fk" FOREIGN KEY ("workspace_id","run_id","event_id") REFERENCES "public"."run_events"("workspace_id","run_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_items" ADD CONSTRAINT "review_items_artifact_fk" FOREIGN KEY ("workspace_id","run_id","artifact_id") REFERENCES "public"."run_artifacts"("workspace_id","run_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_items" ADD CONSTRAINT "review_items_reviewer_fk" FOREIGN KEY ("workspace_id","reviewed_by") REFERENCES "public"."members"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_artifacts" ADD CONSTRAINT "run_artifacts_run_fk" FOREIGN KEY ("workspace_id","run_id") REFERENCES "public"."runs"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "run_events" ADD CONSTRAINT "run_events_run_fk" FOREIGN KEY ("workspace_id","run_id") REFERENCES "public"."runs"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_task_fk" FOREIGN KEY ("workspace_id","task_id") REFERENCES "public"."tasks"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_agent_fk" FOREIGN KEY ("workspace_id","agent_id") REFERENCES "public"."members"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "grants_agent_created_idx" ON "grants" USING btree ("agent_id","created_at");--> statement-breakpoint
CREATE INDEX "inbox_items_member_created_idx" ON "inbox_items" USING btree ("member_id","created_at");--> statement-breakpoint
CREATE INDEX "run_events_run_created_idx" ON "run_events" USING btree ("run_id","created_at");--> statement-breakpoint
CREATE INDEX "runs_workspace_started_idx" ON "runs" USING btree ("workspace_id","started_at");--> statement-breakpoint
CREATE UNIQUE INDEX "runs_one_active_per_task" ON "runs" USING btree ("task_id") WHERE "runs"."status" IN ('running','paused','needs_review','changes_requested');--> statement-breakpoint
