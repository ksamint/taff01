CREATE OR REPLACE FUNCTION taff_provision_user() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE workspace uuid;
BEGIN
 PERFORM set_config('taff.actor_id',NEW.id,true);
 INSERT INTO workspaces(name,personal_owner_id) VALUES(NEW.name,NEW.id) RETURNING id INTO workspace;
 INSERT INTO members(workspace_id,user_id,name,kind,role) VALUES(workspace,NEW.id,NEW.name,'person','admin')
 ON CONFLICT(workspace_id,user_id) DO UPDATE SET role='admin';
 INSERT INTO members(workspace_id,name,kind,role) VALUES(workspace,'默认智能体 / Default agent','agent','member');
 RETURN NEW;
END;
$$;
