ALTER TABLE "company_contacts" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "contact_roles" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "mind_node_sources" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "project_contacts" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "project_payments" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "task_contacts" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "company_contacts" ADD CONSTRAINT "company_contacts_version" CHECK ("company_contacts"."version" > 0);--> statement-breakpoint
ALTER TABLE "contact_roles" ADD CONSTRAINT "contact_roles_version" CHECK ("contact_roles"."version" > 0);--> statement-breakpoint
ALTER TABLE "mind_node_sources" ADD CONSTRAINT "mind_node_sources_version" CHECK ("mind_node_sources"."version" > 0);--> statement-breakpoint
ALTER TABLE "project_contacts" ADD CONSTRAINT "project_contacts_version" CHECK ("project_contacts"."version" > 0);--> statement-breakpoint
ALTER TABLE "project_payments" ADD CONSTRAINT "project_payments_version" CHECK ("project_payments"."version" > 0);--> statement-breakpoint
ALTER TABLE "task_contacts" ADD CONSTRAINT "task_contacts_version" CHECK ("task_contacts"."version" > 0);--> statement-breakpoint
ALTER TABLE "task_dependencies" ADD CONSTRAINT "task_dependencies_version" CHECK ("task_dependencies"."version" > 0);
--> statement-breakpoint
-- Relationship and payment rows are created/removed by today's core API. A
-- replacement creates a new id. Updates (including task/project FK cascades)
-- must still advance the same row's revision and timestamp before its audit.
CREATE FUNCTION taff_relation_version() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.version := OLD.version + 1;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER company_contacts_version BEFORE UPDATE ON company_contacts FOR EACH ROW EXECUTE FUNCTION taff_relation_version();
--> statement-breakpoint
CREATE TRIGGER contact_roles_version BEFORE UPDATE ON contact_roles FOR EACH ROW EXECUTE FUNCTION taff_relation_version();
--> statement-breakpoint
CREATE TRIGGER mind_node_sources_version BEFORE UPDATE ON mind_node_sources FOR EACH ROW EXECUTE FUNCTION taff_relation_version();
--> statement-breakpoint
CREATE TRIGGER project_contacts_version BEFORE UPDATE ON project_contacts FOR EACH ROW EXECUTE FUNCTION taff_relation_version();
--> statement-breakpoint
CREATE TRIGGER project_payments_version BEFORE UPDATE ON project_payments FOR EACH ROW EXECUTE FUNCTION taff_relation_version();
--> statement-breakpoint
CREATE TRIGGER task_contacts_version BEFORE UPDATE ON task_contacts FOR EACH ROW EXECUTE FUNCTION taff_relation_version();
--> statement-breakpoint
CREATE TRIGGER task_dependencies_version BEFORE UPDATE ON task_dependencies FOR EACH ROW EXECUTE FUNCTION taff_relation_version();
