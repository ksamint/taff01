CREATE TABLE trusted_review_receipts (
  id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL REFERENCES workspaces(id),
  operation_hash text NOT NULL,
  result jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
--> statement-breakpoint
CREATE TRIGGER trusted_review_receipts_audit AFTER INSERT ON trusted_review_receipts FOR EACH ROW EXECUTE FUNCTION taff_audit_change();
