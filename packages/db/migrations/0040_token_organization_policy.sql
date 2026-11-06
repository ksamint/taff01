ALTER TABLE agent_tokens ADD COLUMN organization_policy text NOT NULL DEFAULT 'explicit' CONSTRAINT agent_tokens_organization_policy CHECK (organization_policy IN ('explicit', 'all_organizations'));
--> statement-breakpoint
ALTER TABLE agent_tokens ADD COLUMN version integer NOT NULL DEFAULT 1;
--> statement-breakpoint
ALTER TABLE agent_token_workspaces ADD COLUMN origin text NOT NULL DEFAULT 'manual' CONSTRAINT agent_token_workspaces_origin CHECK (origin IN ('manual', 'policy')), ADD COLUMN revoked_by uuid;
