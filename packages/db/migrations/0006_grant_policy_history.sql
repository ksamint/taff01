-- Whitelisted policy/grant history makes each decision reviewable without logging secrets.
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
  PERFORM pg_notify('taff_changes', json_build_object('activityId', change_id, 'workspaceId', workspace, 'resourceId', resource, 'action', TG_TABLE_NAME || '.' || lower(TG_OP))::text);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
