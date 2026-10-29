CREATE TABLE approved_agent_receipts (
 id uuid PRIMARY KEY,
 workspace_id uuid NOT NULL REFERENCES workspaces(id),
 token_id uuid NOT NULL REFERENCES agent_tokens(id),
 operation_hash text NOT NULL,
 result jsonb NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TRIGGER approved_agent_receipts_audit AFTER INSERT ON approved_agent_receipts FOR EACH ROW EXECUTE FUNCTION taff_audit_change();
