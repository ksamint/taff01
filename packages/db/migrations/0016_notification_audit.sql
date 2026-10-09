-- User-targeted events allow profile cache invalidation without broadcasting auth metadata.
CREATE OR REPLACE FUNCTION taff_audit_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE row_data jsonb; prior jsonb; actor text; workspace uuid; resource text; change_id uuid; recipient text; private_event boolean := false; audit_details jsonb := '{}';
BEGIN
  IF TG_OP = 'DELETE' THEN row_data := to_jsonb(OLD); ELSE row_data := to_jsonb(NEW); END IF;
  IF TG_OP = 'UPDATE' THEN prior := to_jsonb(OLD); END IF;
  resource := row_data->>'id';
  IF TG_TABLE_NAME = 'users' THEN actor := row_data->>'id';
  ELSIF TG_TABLE_NAME IN ('sessions', 'accounts') THEN actor := row_data->>'user_id';
  ELSIF TG_TABLE_NAME = 'verifications' THEN actor := 'system:auth';
  ELSIF TG_TABLE_NAME = 'notification_preferences' THEN actor := coalesce(nullif(current_setting('taff.actor_id', true), ''), resource);
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
  recipient := CASE WHEN TG_TABLE_NAME IN ('users','notification_preferences') THEN resource WHEN TG_TABLE_NAME IN ('sessions','accounts','members','daily_digests') THEN row_data->>'user_id' ELSE NULL END;
  private_event := TG_TABLE_NAME IN ('notification_preferences','daily_digests','inbox_items');
  IF TG_TABLE_NAME = 'inbox_items' THEN
    SELECT user_id INTO recipient FROM members WHERE id=(row_data->>'member_id')::uuid AND workspace_id=workspace;
  END IF;
  PERFORM pg_notify('taff_changes', (jsonb_build_object('activityId', change_id, 'workspaceId', workspace, 'resourceId', resource, 'action', TG_TABLE_NAME || '.' || lower(TG_OP), 'actorId', actor, 'userId', recipient) || CASE WHEN private_event THEN jsonb_build_object('recipientOnly',true) ELSE '{}'::jsonb END)::text);
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;


--> statement-breakpoint
CREATE TRIGGER notification_preferences_audit AFTER INSERT OR UPDATE OR DELETE ON notification_preferences FOR EACH ROW EXECUTE FUNCTION taff_audit_change();
--> statement-breakpoint
CREATE TRIGGER daily_digests_audit AFTER INSERT OR UPDATE OR DELETE ON daily_digests FOR EACH ROW EXECUTE FUNCTION taff_audit_change();
--> statement-breakpoint
CREATE FUNCTION taff_notification_defaults() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO notification_preferences(id) VALUES(NEW.id);
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER users_notification_defaults AFTER INSERT ON users FOR EACH ROW EXECUTE FUNCTION taff_notification_defaults();
--> statement-breakpoint
SELECT set_config('taff.actor_id','system:m7-defaults',true);
--> statement-breakpoint
INSERT INTO notification_preferences(id) SELECT id FROM users ON CONFLICT DO NOTHING;
