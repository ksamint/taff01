CREATE TABLE "project_budgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"amount_micros" bigint NOT NULL,
	"currency" text NOT NULL,
	CONSTRAINT "project_budgets_project_unique" UNIQUE("project_id"),
	CONSTRAINT "project_budgets_amount_check" CHECK ("project_budgets"."amount_micros" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "project_budgets_currency_check" CHECK ("project_budgets"."currency" ~ '^[A-Z]{3}$')
);
--> statement-breakpoint
ALTER TABLE "project_budgets" ADD CONSTRAINT "project_budgets_project_fk" FOREIGN KEY ("workspace_id","project_id") REFERENCES "public"."projects"("workspace_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
CREATE TRIGGER "project_budgets_audit_change" AFTER INSERT OR UPDATE OR DELETE ON "project_budgets"
FOR EACH ROW EXECUTE FUNCTION taff_audit_change();
