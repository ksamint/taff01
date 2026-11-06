CREATE TABLE summary_renders (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL,
 summary_id uuid NOT NULL,
 format text NOT NULL CHECK (format IN ('txt','png')),
 body text,
 bytes bytea,
 byte_size integer NOT NULL CHECK (byte_size > 0),
 renderer_version text NOT NULL CHECK (length(btrim(renderer_version)) BETWEEN 1 AND 100),
 content_hash text NOT NULL CHECK (content_hash ~ '^[a-f0-9]{64}$'),
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT summary_renders_summary_format UNIQUE(summary_id,format),
 CONSTRAINT summary_renders_summary_fk FOREIGN KEY(workspace_id,summary_id) REFERENCES daily_summaries(workspace_id,id) ON DELETE CASCADE,
 CONSTRAINT summary_renders_shape CHECK ((format='txt' AND body IS NOT NULL AND bytes IS NULL AND char_length(body)<=4000 AND byte_size=octet_length(body)) OR (format='png' AND body IS NULL AND bytes IS NOT NULL AND byte_size=octet_length(bytes) AND byte_size<=409600))
);
--> statement-breakpoint
CREATE TRIGGER summary_renders_immutable BEFORE UPDATE ON summary_renders FOR EACH ROW EXECUTE FUNCTION taff_summary_immutable();
--> statement-breakpoint
CREATE TRIGGER summary_renders_audit AFTER INSERT OR UPDATE OR DELETE ON summary_renders FOR EACH ROW EXECUTE FUNCTION taff_audit_change();
--> statement-breakpoint
ALTER TABLE agent_tokens DROP CONSTRAINT agent_tokens_scopes_known, ADD CONSTRAINT agent_tokens_scopes_known CHECK (scopes <@ ARRAY['tasks:read','tasks:write','calendar:write','inbox:review','files:write','summaries:read']::text[]);
--> statement-breakpoint
CREATE INDEX daily_summaries_created_idx ON daily_summaries(created_at,id);
--> statement-breakpoint
CREATE INDEX activity_summary_render_failure_idx ON activity(resource_id,created_at) WHERE action='summary.render_failed';
