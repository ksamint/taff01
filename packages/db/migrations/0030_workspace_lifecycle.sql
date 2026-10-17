ALTER TABLE users ADD COLUMN default_workspace_id uuid;
--> statement-breakpoint
ALTER TABLE workspaces ADD COLUMN personal_owner_id text UNIQUE REFERENCES users(id) ON DELETE SET NULL;
--> statement-breakpoint
ALTER TABLE workspaces ADD COLUMN archived_at timestamptz;
--> statement-breakpoint
-- Signup's provisioning trigger records the new user's identity as actor.
-- Choose the earliest audited matching workspace, never a later namesake.
WITH candidates AS (
 SELECT DISTINCT ON (u.id) u.id user_id,w.id workspace_id
 FROM users u JOIN activity a ON a.actor_id=u.id AND a.action='workspaces.insert'
 JOIN workspaces w ON w.id::text=a.resource_id AND w.name=u.name
 ORDER BY u.id,w.created_at,w.id
)
UPDATE workspaces w SET personal_owner_id=c.user_id FROM candidates c WHERE w.id=c.workspace_id;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION taff_provision_user() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE workspace uuid;
BEGIN
 PERFORM set_config('taff.actor_id',NEW.id,true);
 INSERT INTO workspaces(name,personal_owner_id) VALUES(NEW.name,NEW.id) RETURNING id INTO workspace;
 INSERT INTO members(workspace_id,user_id,name,kind,role) VALUES(workspace,NEW.id,NEW.name,'person','admin')
 ON CONFLICT(workspace_id,user_id) DO UPDATE SET role='admin';
 RETURN NEW;
END;
$$;
