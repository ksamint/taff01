ALTER TABLE "runs" ADD COLUMN "paused_by" text;--> statement-breakpoint
ALTER TABLE "runs" ADD CONSTRAINT "runs_paused_by" CHECK ("runs"."paused_by" IS NULL OR "runs"."paused_by" IN ('person', 'agent', 'limit'));--> statement-breakpoint
-- Reviewers, deciders and token/invite creators must be people; a token's member must be an agent.
CREATE FUNCTION taff_require_member_kind(ws uuid, member uuid, wanted member_kind, col text) RETURNS void LANGUAGE plpgsql AS $$
DECLARE actual member_kind;
BEGIN
  IF member IS NULL THEN RETURN; END IF;
  SELECT kind INTO actual FROM members WHERE id = member AND workspace_id = ws;
  IF actual IS DISTINCT FROM wanted THEN RAISE EXCEPTION '% must reference a % member', col, wanted; END IF;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION taff_validate_member_kinds() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_TABLE_NAME = 'review_items' THEN PERFORM taff_require_member_kind(NEW.workspace_id, NEW.reviewed_by, 'person', 'reviewed_by');
  ELSIF TG_TABLE_NAME = 'grants' THEN PERFORM taff_require_member_kind(NEW.workspace_id, NEW.decided_by, 'person', 'decided_by');
  ELSIF TG_TABLE_NAME = 'agent_tokens' THEN
    PERFORM taff_require_member_kind(NEW.workspace_id, NEW.created_by, 'person', 'created_by');
    PERFORM taff_require_member_kind(NEW.workspace_id, NEW.member_id, 'agent', 'member_id');
  ELSIF TG_TABLE_NAME = 'workspace_invites' THEN PERFORM taff_require_member_kind(NEW.workspace_id, NEW.created_by, 'person', 'created_by');
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER review_items_member_kinds BEFORE INSERT OR UPDATE ON review_items FOR EACH ROW EXECUTE FUNCTION taff_validate_member_kinds();
--> statement-breakpoint
CREATE TRIGGER grants_member_kinds BEFORE INSERT OR UPDATE ON grants FOR EACH ROW EXECUTE FUNCTION taff_validate_member_kinds();
--> statement-breakpoint
CREATE TRIGGER agent_tokens_member_kinds BEFORE INSERT OR UPDATE ON agent_tokens FOR EACH ROW EXECUTE FUNCTION taff_validate_member_kinds();
--> statement-breakpoint
CREATE TRIGGER workspace_invites_member_kinds BEFORE INSERT OR UPDATE ON workspace_invites FOR EACH ROW EXECUTE FUNCTION taff_validate_member_kinds();
--> statement-breakpoint
-- Capabilities and scopes are closed vocabularies; reject anything the code tables cannot look up.
ALTER TABLE agent_permissions ADD CONSTRAINT agent_permissions_capability_format CHECK (capability ~ '^[a-z0-9_.-]{1,64}$');
--> statement-breakpoint
ALTER TABLE grants ADD CONSTRAINT grants_capability_format CHECK (capability IS NULL OR capability ~ '^[a-z0-9_.-]{1,64}$');
--> statement-breakpoint
ALTER TABLE run_events ADD CONSTRAINT run_events_capability_format CHECK (capability IS NULL OR capability ~ '^[a-z0-9_.-]{1,64}$');
--> statement-breakpoint
ALTER TABLE agent_tokens ADD CONSTRAINT agent_tokens_scopes_known CHECK (scopes <@ ARRAY['tasks:read','tasks:write','calendar:write','inbox:review','files:write']::text[]);
