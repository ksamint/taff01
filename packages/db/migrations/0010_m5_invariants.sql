-- User-targeted events allow profile cache invalidation without broadcasting auth metadata.
CREATE OR REPLACE FUNCTION taff_audit_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE row_data jsonb; prior jsonb; actor text; workspace uuid; resource text; change_id uuid; audit_details jsonb := '{}';
BEGIN
  IF TG_OP = 'DELETE' THEN row_data := to_jsonb(OLD); ELSE row_data := to_jsonb(NEW); END IF;
  IF TG_OP = 'UPDATE' THEN prior := to_jsonb(OLD); END IF;
  resource := row_data->>'id';
  IF TG_TABLE_NAME = 'users' THEN actor := row_data->>'id';
  ELSIF TG_TABLE_NAME IN ('sessions', 'accounts') THEN actor := row_data->>'user_id';
  ELSIF TG_TABLE_NAME = 'verifications' THEN actor := 'system:auth';
  ELSE actor := nullif(current_setting('taff.actor_id', true), ''); END IF;
  IF actor IS NULL THEN RAISE EXCEPTION 'Taff mutation requires an actor'; END IF;
  IF TG_TABLE_NAME = 'workspaces' THEN workspace := resource::uuid;
  ELSE workspace := (row_data->>'workspace_id')::uuid; END IF;
  IF TG_TABLE_NAME IN ('agent_profiles','agent_permissions','grants') THEN
    audit_details := jsonb_build_object('capability',row_data->'capability','decision',row_data->'decision',
      'status',row_data->'status','expiresAt',row_data->'expires_at','decidedBy',row_data->'decided_by',
      'reviewPolicy',row_data->'review_policy','supervisorId',row_data->'supervisor_id',
      'maxDurationMs',row_data->'max_duration_ms','maxCostMicros',row_data->'max_cost_micros',
      'taskId',row_data->'task_id','runId',row_data->'run_id',
      'previousStatus',prior->'status','previousDecision',prior->'decision','previousReviewPolicy',prior->'review_policy');
  END IF;
  INSERT INTO activity(actor_id, workspace_id, action, resource_id, details)
    VALUES (actor, workspace, TG_TABLE_NAME || '.' || lower(TG_OP), resource, audit_details) RETURNING id INTO change_id;
  PERFORM pg_notify('taff_changes', json_build_object('activityId', change_id, 'workspaceId', workspace, 'resourceId', resource, 'action', TG_TABLE_NAME || '.' || lower(TG_OP), 'actorId', actor, 'userId', CASE WHEN TG_TABLE_NAME = 'users' THEN row_data->>'id' WHEN TG_TABLE_NAME IN ('sessions','accounts','members') THEN row_data->>'user_id' ELSE NULL END)::text);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

--> statement-breakpoint
CREATE TRIGGER projects_audit AFTER INSERT OR UPDATE OR DELETE ON projects FOR EACH ROW EXECUTE FUNCTION taff_audit_change();
--> statement-breakpoint
CREATE TRIGGER task_comments_audit AFTER INSERT OR UPDATE OR DELETE ON task_comments FOR EACH ROW EXECUTE FUNCTION taff_audit_change();
--> statement-breakpoint
CREATE TRIGGER workspace_invites_audit AFTER INSERT OR UPDATE OR DELETE ON workspace_invites FOR EACH ROW EXECUTE FUNCTION taff_audit_change();
--> statement-breakpoint
CREATE FUNCTION taff_task_planning_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_workspace uuid; parent_status task_status;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.parent_id IS DISTINCT FROM OLD.parent_id THEN RAISE EXCEPTION USING MESSAGE='taff_invalid', ERRCODE='P0001'; END IF;
    NEW.version := OLD.version + 1;
  END IF;
  IF length(NEW.description)>20000 OR cardinality(NEW.labels)>20 OR EXISTS (SELECT 1 FROM unnest(NEW.labels) label WHERE length(btrim(label)) NOT BETWEEN 1 AND 40) OR cardinality(NEW.labels) <> (SELECT count(DISTINCT label) FROM unnest(NEW.labels) label) THEN RAISE EXCEPTION USING MESSAGE='taff_invalid', ERRCODE='P0001'; END IF;
  IF TG_OP = 'INSERT' AND NEW.parent_id IS NOT NULL THEN
    SELECT workspace_id,status INTO parent_workspace,parent_status FROM tasks WHERE id=NEW.parent_id FOR UPDATE;
    IF parent_workspace IS NULL OR parent_workspace <> NEW.workspace_id OR NEW.parent_id=NEW.id THEN RAISE EXCEPTION USING MESSAGE='taff_invalid', ERRCODE='P0001'; END IF;
    IF parent_status='done' THEN RAISE EXCEPTION USING MESSAGE='taff_conflict', ERRCODE='P0001'; END IF;
  END IF;
  IF NEW.status='done' AND (TG_OP='INSERT' OR OLD.status <> 'done') AND EXISTS (SELECT 1 FROM tasks WHERE parent_id=NEW.id AND status<>'done') THEN RAISE EXCEPTION USING MESSAGE='taff_conflict', ERRCODE='P0001'; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER tasks_planning_guard BEFORE INSERT OR UPDATE ON tasks FOR EACH ROW EXECUTE FUNCTION taff_task_planning_guard();
