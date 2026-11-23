CREATE TABLE "task_criteria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"position" integer NOT NULL,
	"text" text NOT NULL,
	"checked_by" uuid,
	"checked_at" timestamp with time zone,
	CONSTRAINT "task_criteria_task_position_unique" UNIQUE("task_id","position") DEFERRABLE INITIALLY DEFERRED,
	CONSTRAINT "task_criteria_position_check" CHECK ("task_criteria"."position" >= 0),
	CONSTRAINT "task_criteria_text_check" CHECK (char_length("task_criteria"."text") BETWEEN 1 AND 300 AND btrim("task_criteria"."text") <> ''),
	CONSTRAINT "task_criteria_checked_pair_check" CHECK (("task_criteria"."checked_by" IS NULL) = ("task_criteria"."checked_at" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "task_criteria" ADD CONSTRAINT "task_criteria_task_fk" FOREIGN KEY ("workspace_id","task_id") REFERENCES "public"."tasks"("workspace_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE TRIGGER "task_criteria_audit_change" AFTER INSERT OR UPDATE OR DELETE ON "task_criteria"
FOR EACH ROW EXECUTE FUNCTION taff_audit_change();
