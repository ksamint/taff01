CREATE TABLE agent_token_workspaces (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 token_id uuid NOT NULL REFERENCES agent_tokens(id) ON DELETE CASCADE,
 workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 member_id uuid NOT NULL,
 granted_by uuid NOT NULL,
 scopes text[] NOT NULL,
 revoked_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT agent_token_workspaces_token_workspace UNIQUE(token_id, workspace_id),
 CONSTRAINT agent_token_workspaces_member_fk FOREIGN KEY(workspace_id, member_id) REFERENCES members(workspace_id, id),
 CONSTRAINT agent_token_workspaces_grantor_fk FOREIGN KEY(workspace_id, granted_by) REFERENCES members(workspace_id, id)
);
--> statement-breakpoint
INSERT INTO agent_token_workspaces(token_id,workspace_id,member_id,granted_by,scopes,revoked_at)
SELECT id,workspace_id,member_id,created_by,scopes,NULL FROM agent_tokens WHERE oauth_client_id IS NULL;

--> statement-breakpoint
CREATE TRIGGER agent_token_workspaces_audit AFTER INSERT OR UPDATE OR DELETE ON agent_token_workspaces FOR EACH ROW EXECUTE FUNCTION taff_audit_change();
