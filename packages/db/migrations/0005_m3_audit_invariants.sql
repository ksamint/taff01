CREATE TRIGGER agent_profiles_audit AFTER INSERT OR UPDATE OR DELETE ON agent_profiles FOR EACH ROW EXECUTE FUNCTION taff_audit_change();
--> statement-breakpoint
CREATE TRIGGER agent_permissions_audit AFTER INSERT OR UPDATE OR DELETE ON agent_permissions FOR EACH ROW EXECUTE FUNCTION taff_audit_change();
--> statement-breakpoint
CREATE TRIGGER grants_audit AFTER INSERT OR UPDATE OR DELETE ON grants FOR EACH ROW EXECUTE FUNCTION taff_audit_change();
--> statement-breakpoint
CREATE TRIGGER runs_audit AFTER INSERT OR UPDATE OR DELETE ON runs FOR EACH ROW EXECUTE FUNCTION taff_audit_change();
--> statement-breakpoint
CREATE TRIGGER run_events_audit AFTER INSERT OR UPDATE OR DELETE ON run_events FOR EACH ROW EXECUTE FUNCTION taff_audit_change();
--> statement-breakpoint
CREATE TRIGGER run_artifacts_audit AFTER INSERT OR UPDATE OR DELETE ON run_artifacts FOR EACH ROW EXECUTE FUNCTION taff_audit_change();
--> statement-breakpoint
CREATE TRIGGER review_checks_audit AFTER INSERT OR UPDATE OR DELETE ON review_checks FOR EACH ROW EXECUTE FUNCTION taff_audit_change();
--> statement-breakpoint
CREATE TRIGGER review_comments_audit AFTER INSERT OR UPDATE OR DELETE ON review_comments FOR EACH ROW EXECUTE FUNCTION taff_audit_change();
--> statement-breakpoint
CREATE TRIGGER review_items_audit AFTER INSERT OR UPDATE OR DELETE ON review_items FOR EACH ROW EXECUTE FUNCTION taff_audit_change();
--> statement-breakpoint
CREATE TRIGGER inbox_items_audit AFTER INSERT OR UPDATE OR DELETE ON inbox_items FOR EACH ROW EXECUTE FUNCTION taff_audit_change();
--> statement-breakpoint
CREATE TRIGGER mcp_calls_audit AFTER INSERT OR UPDATE OR DELETE ON mcp_calls FOR EACH ROW EXECUTE FUNCTION taff_audit_change();
--> statement-breakpoint
CREATE FUNCTION taff_validate_agent_relationships() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE agent uuid;
BEGIN
  IF TG_TABLE_NAME = 'agent_profiles' THEN agent := NEW.id; ELSE agent := NEW.agent_id; END IF;
  IF NOT EXISTS (SELECT 1 FROM members WHERE id = agent AND workspace_id = NEW.workspace_id AND kind = 'agent') THEN
    RAISE EXCEPTION 'Agent identity must belong to this workspace' USING ERRCODE = '23514';
  END IF;
  IF TG_TABLE_NAME = 'agent_profiles' AND (to_jsonb(NEW)->>'supervisor_id') IS NOT NULL AND NOT EXISTS
    (SELECT 1 FROM members WHERE id = (to_jsonb(NEW)->>'supervisor_id')::uuid AND workspace_id = NEW.workspace_id AND kind = 'person') THEN
    RAISE EXCEPTION 'Agent supervisor must be a person in this workspace' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER agent_profiles_validate BEFORE INSERT OR UPDATE ON agent_profiles FOR EACH ROW EXECUTE FUNCTION taff_validate_agent_relationships();
--> statement-breakpoint
CREATE TRIGGER agent_permissions_validate BEFORE INSERT OR UPDATE ON agent_permissions FOR EACH ROW EXECUTE FUNCTION taff_validate_agent_relationships();
--> statement-breakpoint
CREATE TRIGGER grants_validate BEFORE INSERT OR UPDATE ON grants FOR EACH ROW EXECUTE FUNCTION taff_validate_agent_relationships();
--> statement-breakpoint
CREATE TRIGGER runs_validate BEFORE INSERT OR UPDATE ON runs FOR EACH ROW EXECUTE FUNCTION taff_validate_agent_relationships();
--> statement-breakpoint
CREATE FUNCTION taff_immutable_member_kind() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.kind <> OLD.kind THEN RAISE EXCEPTION 'Member identity kind is immutable' USING ERRCODE = '23514'; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER members_kind_immutable BEFORE UPDATE ON members FOR EACH ROW EXECUTE FUNCTION taff_immutable_member_kind();
