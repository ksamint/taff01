CREATE TABLE "project_phases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date NOT NULL,
	CONSTRAINT "project_phases_position_unique" UNIQUE("project_id","position"),
	CONSTRAINT "project_phases_position_check" CHECK ("project_phases"."position" >= 0),
	CONSTRAINT "project_phases_name_check" CHECK (char_length(btrim("project_phases"."name")) BETWEEN 1 AND 120),
	CONSTRAINT "project_phases_span_check" CHECK ("project_phases"."start_date" >= DATE '1970-01-01' AND "project_phases"."start_date" <= "project_phases"."end_date" AND "project_phases"."end_date" < DATE '2200-01-01')
);
--> statement-breakpoint
ALTER TABLE "project_phases" ADD CONSTRAINT "project_phases_project_fk" FOREIGN KEY ("workspace_id","project_id") REFERENCES "public"."projects"("workspace_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE TRIGGER "project_phases_audit_change" AFTER INSERT OR UPDATE OR DELETE ON "project_phases"
FOR EACH ROW EXECUTE FUNCTION taff_audit_change();
