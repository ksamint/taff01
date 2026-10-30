ALTER TABLE activity ADD COLUMN trace_id text;
--> statement-breakpoint
ALTER TABLE activity ADD CONSTRAINT activity_trace_format CHECK (trace_id IS NULL OR trace_id ~ '^[a-f0-9]{32}$');
--> statement-breakpoint
CREATE INDEX activity_workspace_trace_idx ON activity(workspace_id, trace_id);
--> statement-breakpoint
-- Business rows and receipt persistence inherit the same transaction-local context.
CREATE FUNCTION taff_integration_audit_context() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE context jsonb;
BEGIN
  context := nullif(current_setting('taff.integration_audit', true), '')::jsonb;
  IF context IS NOT NULL THEN
    NEW.trace_id := context->>'trace_id';
    NEW.details := NEW.details || context;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER activity_integration_context BEFORE INSERT ON activity FOR EACH ROW EXECUTE FUNCTION taff_integration_audit_context();
