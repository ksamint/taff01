CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"name" text NOT NULL,
	"industry" text DEFAULT '' NOT NULL,
	"archived_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "companies_workspace_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "companies_name" CHECK (length(btrim("companies"."name")) BETWEEN 1 AND 200),
	CONSTRAINT "companies_industry" CHECK (length("companies"."industry") <= 100),
	CONSTRAINT "companies_version" CHECK ("companies"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "company_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_contacts_link_unique" UNIQUE("workspace_id","company_id","contact_id")
);
--> statement-breakpoint
CREATE TABLE "contact_roles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"scope" text NOT NULL,
	"role" text NOT NULL,
	"company_id" uuid,
	"project_id" uuid,
	"task_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contact_roles_unique" UNIQUE NULLS NOT DISTINCT("contact_id","role","company_id","project_id","task_id"),
	CONSTRAINT "contact_roles_target" CHECK (("contact_roles"."scope" = 'company' AND "contact_roles"."company_id" IS NOT NULL AND "contact_roles"."project_id" IS NULL AND "contact_roles"."task_id" IS NULL) OR ("contact_roles"."scope" = 'project' AND "contact_roles"."project_id" IS NOT NULL AND "contact_roles"."company_id" IS NULL AND "contact_roles"."task_id" IS NULL) OR ("contact_roles"."scope" = 'task' AND "contact_roles"."task_id" IS NOT NULL AND "contact_roles"."company_id" IS NULL AND "contact_roles"."project_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"company_id" uuid,
	"name" text NOT NULL,
	"title" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"archived_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contacts_workspace_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "contacts_workspace_id_company_unique" UNIQUE("workspace_id","id","company_id"),
	CONSTRAINT "contacts_name" CHECK (length(btrim("contacts"."name")) BETWEEN 1 AND 200),
	CONSTRAINT "contacts_title" CHECK (length("contacts"."title") <= 200),
	CONSTRAINT "contacts_phone" CHECK (length("contacts"."phone") <= 50),
	CONSTRAINT "contacts_email" CHECK (length("contacts"."email") <= 320),
	CONSTRAINT "contacts_version" CHECK ("contacts"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "milestones" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"name" text NOT NULL,
	"date" date NOT NULL,
	"archived_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "milestones_workspace_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "milestones_name" CHECK (length(btrim("milestones"."name")) BETWEEN 1 AND 200),
	CONSTRAINT "milestones_version" CHECK ("milestones"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "project_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_contacts_link_unique" UNIQUE("workspace_id","project_id","contact_id")
);
--> statement-breakpoint
CREATE TABLE "project_payments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"paid_on" date NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_payments_amount" CHECK ("project_payments"."amount" > 0),
	CONSTRAINT "project_payments_note" CHECK (length("project_payments"."note") <= 500)
);
--> statement-breakpoint
CREATE TABLE "task_contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_contacts_link_unique" UNIQUE("workspace_id","task_id","contact_id")
);
--> statement-breakpoint
CREATE TABLE "task_dependencies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"predecessor_task_id" uuid,
	"predecessor_milestone_id" uuid,
	"successor_task_id" uuid,
	"successor_milestone_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_dependencies_pair" UNIQUE NULLS NOT DISTINCT("workspace_id","predecessor_task_id","predecessor_milestone_id","successor_task_id","successor_milestone_id"),
	CONSTRAINT "task_dependencies_ends" CHECK (num_nonnulls("task_dependencies"."predecessor_task_id", "task_dependencies"."predecessor_milestone_id") = 1 AND num_nonnulls("task_dependencies"."successor_task_id", "task_dependencies"."successor_milestone_id") = 1),
	CONSTRAINT "task_dependencies_self" CHECK ("task_dependencies"."predecessor_task_id" IS DISTINCT FROM "task_dependencies"."successor_task_id" OR "task_dependencies"."predecessor_task_id" IS NULL),
	CONSTRAINT "task_dependencies_self_milestone" CHECK ("task_dependencies"."predecessor_milestone_id" IS DISTINCT FROM "task_dependencies"."successor_milestone_id" OR "task_dependencies"."predecessor_milestone_id" IS NULL)
);
--> statement-breakpoint
CREATE TABLE "task_plans" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"duration_days" integer NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_plans_duration" CHECK ("task_plans"."duration_days" BETWEEN 1 AND 3650),
	CONSTRAINT "task_plans_version" CHECK ("task_plans"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "contract_amount" numeric(14, 2);--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "currency" text;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "client_company_id" uuid;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_workspace_id_project_unique" UNIQUE("workspace_id","id","project_id");--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_contacts" ADD CONSTRAINT "company_contacts_employer_fk" FOREIGN KEY ("workspace_id","contact_id","company_id") REFERENCES "public"."contacts"("workspace_id","id","company_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "company_contacts" ADD CONSTRAINT "company_contacts_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_roles" ADD CONSTRAINT "contact_roles_company_link_fk" FOREIGN KEY ("workspace_id","company_id","contact_id") REFERENCES "public"."company_contacts"("workspace_id","company_id","contact_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_roles" ADD CONSTRAINT "contact_roles_project_link_fk" FOREIGN KEY ("workspace_id","project_id","contact_id") REFERENCES "public"."project_contacts"("workspace_id","project_id","contact_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contact_roles" ADD CONSTRAINT "contact_roles_task_link_fk" FOREIGN KEY ("workspace_id","task_id","contact_id") REFERENCES "public"."task_contacts"("workspace_id","task_id","contact_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "milestones" ADD CONSTRAINT "milestones_project_fk" FOREIGN KEY ("workspace_id","project_id") REFERENCES "public"."projects"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_contacts" ADD CONSTRAINT "project_contacts_project_fk" FOREIGN KEY ("workspace_id","project_id") REFERENCES "public"."projects"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_contacts" ADD CONSTRAINT "project_contacts_contact_fk" FOREIGN KEY ("workspace_id","contact_id") REFERENCES "public"."contacts"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_payments" ADD CONSTRAINT "project_payments_project_fk" FOREIGN KEY ("workspace_id","project_id") REFERENCES "public"."projects"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_payments" ADD CONSTRAINT "project_payments_creator_fk" FOREIGN KEY ("workspace_id","created_by") REFERENCES "public"."members"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_contacts" ADD CONSTRAINT "task_contacts_stakeholder_fk" FOREIGN KEY ("workspace_id","project_id","contact_id") REFERENCES "public"."project_contacts"("workspace_id","project_id","contact_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_contacts" ADD CONSTRAINT "task_contacts_task_fk" FOREIGN KEY ("workspace_id","task_id","project_id") REFERENCES "public"."tasks"("workspace_id","id","project_id") ON DELETE cascade ON UPDATE cascade;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_predecessor_task_fk" FOREIGN KEY ("workspace_id","predecessor_task_id") REFERENCES "public"."tasks"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_successor_task_fk" FOREIGN KEY ("workspace_id","successor_task_id") REFERENCES "public"."tasks"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_predecessor_milestone_fk" FOREIGN KEY ("workspace_id","predecessor_milestone_id") REFERENCES "public"."milestones"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_successor_milestone_fk" FOREIGN KEY ("workspace_id","successor_milestone_id") REFERENCES "public"."milestones"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "task_plans" ADD CONSTRAINT "task_plans_task_fk" FOREIGN KEY ("workspace_id","id") REFERENCES "public"."tasks"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "companies_workspace_name_idx" ON "companies" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "contact_roles_company_exclusive_idx" ON "contact_roles" USING btree ("company_id","role") WHERE "contact_roles"."scope" = 'company' AND "contact_roles"."role" = 'chair';--> statement-breakpoint
CREATE UNIQUE INDEX "contact_roles_project_exclusive_idx" ON "contact_roles" USING btree ("project_id","role") WHERE "contact_roles"."scope" = 'project' AND "contact_roles"."role" = 'signoff';--> statement-breakpoint
CREATE UNIQUE INDEX "contact_roles_task_exclusive_idx" ON "contact_roles" USING btree ("task_id","role") WHERE "contact_roles"."scope" = 'task' AND "contact_roles"."role" = 'signoff';--> statement-breakpoint
CREATE INDEX "contacts_workspace_name_idx" ON "contacts" USING btree ("workspace_id","name");--> statement-breakpoint
CREATE INDEX "contacts_company_idx" ON "contacts" USING btree ("workspace_id","company_id");--> statement-breakpoint
CREATE INDEX "milestones_project_idx" ON "milestones" USING btree ("workspace_id","project_id");--> statement-breakpoint
CREATE INDEX "project_payments_project_idx" ON "project_payments" USING btree ("workspace_id","project_id");--> statement-breakpoint
CREATE INDEX "task_contacts_project_idx" ON "task_contacts" USING btree ("workspace_id","project_id");--> statement-breakpoint
CREATE INDEX "task_dependencies_workspace_idx" ON "task_dependencies" USING btree ("workspace_id");--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_company_fk" FOREIGN KEY ("workspace_id","client_company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_currency" CHECK ("projects"."currency" IS NULL OR "projects"."currency" ~ '^[A-Z]{3}$');--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_contract" CHECK ("projects"."contract_amount" IS NULL OR ("projects"."contract_amount" >= 0 AND "projects"."currency" IS NOT NULL));--> statement-breakpoint
-- Hand-written (ADR 0015). The employer reference clears only company_id when a company row goes away.
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_company_fk" FOREIGN KEY ("workspace_id","company_id") REFERENCES "public"."companies"("workspace_id","id") ON DELETE SET NULL ("company_id");
--> statement-breakpoint
-- Generated from CONTACT_ROLE_RULES in packages/schemas/src/crm.ts; a test keeps them equal.
ALTER TABLE "contact_roles" ADD CONSTRAINT "contact_roles_scope_role" CHECK ((scope, role) IN (('company','decider'),('project','decider'),('task','decider'),('company','chair'),('company','ops'),('project','ops'),('task','ops'),('project','broker'),('project','tech'),('task','tech'),('company','finance'),('project','finance'),('project','signoff'),('task','signoff')));
--> statement-breakpoint
ALTER TABLE agent_tokens DROP CONSTRAINT agent_tokens_scopes_known;
--> statement-breakpoint
ALTER TABLE agent_tokens ADD CONSTRAINT agent_tokens_scopes_known CHECK (scopes <@ ARRAY['tasks:read','tasks:write','calendar:write','inbox:review','files:write','crm:read']::text[]);
--> statement-breakpoint
CREATE TRIGGER companies_audit AFTER INSERT OR UPDATE OR DELETE ON companies FOR EACH ROW EXECUTE FUNCTION taff_audit_change();
--> statement-breakpoint
CREATE TRIGGER contacts_audit AFTER INSERT OR UPDATE OR DELETE ON contacts FOR EACH ROW EXECUTE FUNCTION taff_audit_change();
--> statement-breakpoint
CREATE TRIGGER company_contacts_audit AFTER INSERT OR UPDATE OR DELETE ON company_contacts FOR EACH ROW EXECUTE FUNCTION taff_audit_change();
--> statement-breakpoint
CREATE TRIGGER project_contacts_audit AFTER INSERT OR UPDATE OR DELETE ON project_contacts FOR EACH ROW EXECUTE FUNCTION taff_audit_change();
--> statement-breakpoint
CREATE TRIGGER task_contacts_audit AFTER INSERT OR UPDATE OR DELETE ON task_contacts FOR EACH ROW EXECUTE FUNCTION taff_audit_change();
--> statement-breakpoint
CREATE TRIGGER contact_roles_audit AFTER INSERT OR UPDATE OR DELETE ON contact_roles FOR EACH ROW EXECUTE FUNCTION taff_audit_change();
--> statement-breakpoint
CREATE TRIGGER task_plans_audit AFTER INSERT OR UPDATE OR DELETE ON task_plans FOR EACH ROW EXECUTE FUNCTION taff_audit_change();
--> statement-breakpoint
CREATE TRIGGER milestones_audit AFTER INSERT OR UPDATE OR DELETE ON milestones FOR EACH ROW EXECUTE FUNCTION taff_audit_change();
--> statement-breakpoint
CREATE TRIGGER task_dependencies_audit AFTER INSERT OR UPDATE OR DELETE ON task_dependencies FOR EACH ROW EXECUTE FUNCTION taff_audit_change();
--> statement-breakpoint
CREATE TRIGGER project_payments_audit AFTER INSERT OR UPDATE OR DELETE ON project_payments FOR EACH ROW EXECUTE FUNCTION taff_audit_change();
