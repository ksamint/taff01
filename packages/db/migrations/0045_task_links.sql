CREATE TYPE "public"."task_link_kind" AS ENUM('related', 'duplicate');--> statement-breakpoint
CREATE TABLE "task_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"from_task_id" uuid NOT NULL,
	"to_task_id" uuid NOT NULL,
	"kind" "task_link_kind" NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_links_pair_kind" UNIQUE("workspace_id","from_task_id","to_task_id","kind"),
	CONSTRAINT "task_links_canonical_pair" CHECK ("task_links"."from_task_id" < "task_links"."to_task_id")
);
--> statement-breakpoint
ALTER TABLE "task_links" ADD CONSTRAINT "task_links_from_task_fk" FOREIGN KEY ("workspace_id","from_task_id") REFERENCES "public"."tasks"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_links" ADD CONSTRAINT "task_links_to_task_fk" FOREIGN KEY ("workspace_id","to_task_id") REFERENCES "public"."tasks"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_links_to_task_idx" ON "task_links" USING btree ("workspace_id","to_task_id");
--> statement-breakpoint
CREATE TRIGGER "task_links_audit_change" AFTER INSERT OR DELETE ON "task_links"
FOR EACH ROW EXECUTE FUNCTION taff_audit_change();
