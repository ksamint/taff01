CREATE TYPE "public"."project_stage" AS ENUM('lead', 'proposal_sent', 'contract_signed', 'in_service', 'closed');
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "stage" "project_stage";
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "lead_id" uuid;
--> statement-breakpoint
ALTER TABLE "projects" ADD CONSTRAINT "projects_lead_fk" FOREIGN KEY ("workspace_id","lead_id") REFERENCES "public"."members"("workspace_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
-- Like a task owner, the person in charge is a person, never an agent.
CREATE FUNCTION taff_validate_project_lead() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.lead_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM members WHERE id = NEW.lead_id AND workspace_id = NEW.workspace_id AND kind = 'person') THEN
    RAISE EXCEPTION 'Project lead must be a person in its workspace' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER projects_lead_person BEFORE INSERT OR UPDATE OF lead_id ON projects FOR EACH ROW EXECUTE FUNCTION taff_validate_project_lead();
