CREATE TYPE "public"."project_health" AS ENUM('on_track', 'at_risk', 'off_track');--> statement-breakpoint
CREATE TABLE "project_updates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"author_id" uuid NOT NULL,
	"health" "project_health" NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_updates_body" CHECK (char_length("project_updates"."body") <= 2000)
);
--> statement-breakpoint
ALTER TABLE "project_updates" ADD CONSTRAINT "project_updates_project_fk" FOREIGN KEY ("workspace_id","project_id") REFERENCES "public"."projects"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "project_updates_history_idx" ON "project_updates" USING btree ("workspace_id","project_id","created_at" DESC NULLS FIRST,"id" DESC NULLS FIRST);
--> statement-breakpoint
CREATE TRIGGER project_updates_audit AFTER INSERT ON project_updates FOR EACH ROW EXECUTE FUNCTION taff_audit_change();
--> statement-breakpoint
CREATE FUNCTION taff_project_update_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Project updates are immutable' USING ERRCODE = '23514';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER project_updates_immutable BEFORE UPDATE ON project_updates FOR EACH ROW EXECUTE FUNCTION taff_project_update_immutable();
