CREATE TABLE "suggestions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"task_id" uuid,
	"created_by" uuid NOT NULL,
	"kind" text NOT NULL,
	"payload" jsonb NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"decided_by" uuid,
	"decided_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "suggestions_workspace_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "suggestions_kind" CHECK ("suggestions"."kind" IN ('split','reschedule')),
	CONSTRAINT "suggestions_status" CHECK ("suggestions"."status" IN ('pending','applied','dismissed')),
	CONSTRAINT "suggestions_decision" CHECK (("suggestions"."status" = 'pending') = ("suggestions"."decided_by" IS NULL AND "suggestions"."decided_at" IS NULL)),
	CONSTRAINT "suggestions_version" CHECK ("suggestions"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "ai_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_task_fk" FOREIGN KEY ("workspace_id","task_id") REFERENCES "public"."tasks"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_creator_fk" FOREIGN KEY ("workspace_id","created_by") REFERENCES "public"."members"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "suggestions" ADD CONSTRAINT "suggestions_decider_fk" FOREIGN KEY ("workspace_id","decided_by") REFERENCES "public"."members"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "suggestions_workspace_status_idx" ON "suggestions" USING btree ("workspace_id","status","created_at");--> statement-breakpoint
CREATE INDEX "suggestions_task_idx" ON "suggestions" USING btree ("workspace_id","task_id");--> statement-breakpoint
CREATE TRIGGER suggestions_audit AFTER INSERT OR UPDATE OR DELETE ON suggestions FOR EACH ROW EXECUTE FUNCTION taff_audit_change();
