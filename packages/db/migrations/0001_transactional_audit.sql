-- User provisioning is part of the INSERT transaction, including auth adapter writes.
CREATE FUNCTION taff_provision_user() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE workspace uuid;
BEGIN
  PERFORM set_config('taff.actor_id', NEW.id, true);
  INSERT INTO workspaces(name) VALUES (NEW.name) RETURNING id INTO workspace;
  INSERT INTO members(workspace_id, user_id, name, kind, role)
    VALUES (workspace, NEW.id, NEW.name, 'person', 'admin');
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION taff_audit_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE row_data jsonb; actor text; workspace uuid; resource text; change_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN row_data := to_jsonb(OLD); ELSE row_data := to_jsonb(NEW); END IF;
  resource := row_data->>'id';
  IF TG_TABLE_NAME = 'users' THEN actor := row_data->>'id';
  ELSIF TG_TABLE_NAME IN ('sessions', 'accounts') THEN actor := row_data->>'user_id';
  ELSIF TG_TABLE_NAME = 'verifications' THEN actor := 'system:auth';
  ELSE actor := nullif(current_setting('taff.actor_id', true), ''); END IF;
  IF actor IS NULL THEN RAISE EXCEPTION 'Taff mutation requires an actor'; END IF;
  IF TG_TABLE_NAME = 'workspaces' THEN workspace := resource::uuid;
  ELSE workspace := (row_data->>'workspace_id')::uuid; END IF;
  INSERT INTO activity(actor_id, workspace_id, action, resource_id)
    VALUES (actor, workspace, TG_TABLE_NAME || '.' || lower(TG_OP), resource) RETURNING id INTO change_id;
  -- Only routing identifiers leave the database, never passwords, tokens or row contents.
  PERFORM pg_notify('taff_changes', json_build_object('activityId', change_id, 'workspaceId', workspace, 'resourceId', resource, 'action', TG_TABLE_NAME || '.' || lower(TG_OP))::text);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE FUNCTION taff_validate_task_owner() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM members WHERE id = NEW.owner_id AND workspace_id = NEW.workspace_id AND kind = 'person') THEN
    RAISE EXCEPTION 'Task owner must be a person in its workspace' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER tasks_owner_person BEFORE INSERT OR UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION taff_validate_task_owner();
--> statement-breakpoint
CREATE TRIGGER users_provision AFTER INSERT ON users FOR EACH ROW EXECUTE FUNCTION taff_provision_user();
--> statement-breakpoint
CREATE TRIGGER users_audit AFTER INSERT OR UPDATE OR DELETE ON users FOR EACH ROW EXECUTE FUNCTION taff_audit_change();
--> statement-breakpoint
CREATE TRIGGER sessions_audit AFTER INSERT OR UPDATE OR DELETE ON sessions FOR EACH ROW EXECUTE FUNCTION taff_audit_change();
--> statement-breakpoint
CREATE TRIGGER accounts_audit AFTER INSERT OR UPDATE OR DELETE ON accounts FOR EACH ROW EXECUTE FUNCTION taff_audit_change();
--> statement-breakpoint
CREATE TRIGGER verifications_audit AFTER INSERT OR UPDATE OR DELETE ON verifications FOR EACH ROW EXECUTE FUNCTION taff_audit_change();
--> statement-breakpoint
CREATE TRIGGER workspaces_audit AFTER INSERT OR UPDATE OR DELETE ON workspaces FOR EACH ROW EXECUTE FUNCTION taff_audit_change();
--> statement-breakpoint
CREATE TRIGGER members_audit AFTER INSERT OR UPDATE OR DELETE ON members FOR EACH ROW EXECUTE FUNCTION taff_audit_change();
--> statement-breakpoint
CREATE TRIGGER tasks_audit AFTER INSERT OR UPDATE OR DELETE ON tasks FOR EACH ROW EXECUTE FUNCTION taff_audit_change();
