ALTER TABLE "users" ADD COLUMN "username" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "system_admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_username_unique" UNIQUE("username");--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_username" CHECK ("users"."username" is null or "users"."username" ~ '^[a-z0-9_.]{2,30}$');--> statement-breakpoint
-- Serialize promotions with future workspace creation, including empty sets.
CREATE FUNCTION taff_system_admin_lock() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('taff:system-administration',0));
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER workspaces_system_admin_lock BEFORE INSERT ON workspaces FOR EACH ROW EXECUTE FUNCTION taff_system_admin_lock();
--> statement-breakpoint
-- All user inserts acquire the namespace before unique phone/email checks.
-- Otherwise concurrent SMS signup could hold a unique key while waiting for
-- provisioning's lock, which in turn waits for that same identity key.
CREATE TRIGGER users_system_admin_insert_lock BEFORE INSERT ON users FOR EACH ROW EXECUTE FUNCTION taff_system_admin_lock();
--> statement-breakpoint
CREATE TRIGGER users_system_admin_update_lock BEFORE UPDATE OF system_admin ON users FOR EACH ROW WHEN (OLD.system_admin IS DISTINCT FROM NEW.system_admin) EXECUTE FUNCTION taff_system_admin_lock();
--> statement-breakpoint
CREATE TRIGGER users_system_admin_delete_lock BEFORE DELETE ON users FOR EACH ROW WHEN (OLD.system_admin) EXECUTE FUNCTION taff_system_admin_lock();
--> statement-breakpoint
CREATE FUNCTION taff_workspace_system_admins() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO members(workspace_id,user_id,name,kind,role)
    SELECT NEW.id,u.id,u.name,'person','admin' FROM users u WHERE u.system_admin ORDER BY u.id
    ON CONFLICT(workspace_id,user_id) DO UPDATE SET role='admin',updated_at=now()
      WHERE members.role <> 'admin';
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER workspaces_system_admin_members AFTER INSERT ON workspaces FOR EACH ROW EXECUTE FUNCTION taff_workspace_system_admins();
--> statement-breakpoint
CREATE FUNCTION taff_user_system_admin_members() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  INSERT INTO members(workspace_id,user_id,name,kind,role)
    SELECT w.id,NEW.id,NEW.name,'person','admin' FROM workspaces w ORDER BY w.id
    ON CONFLICT(workspace_id,user_id) DO UPDATE SET role='admin',updated_at=now()
      WHERE members.role <> 'admin';
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER users_system_admin_members_insert AFTER INSERT ON users FOR EACH ROW WHEN (NEW.system_admin) EXECUTE FUNCTION taff_user_system_admin_members();
--> statement-breakpoint
CREATE TRIGGER users_system_admin_members_update AFTER UPDATE OF system_admin ON users FOR EACH ROW WHEN (NEW.system_admin AND NOT OLD.system_admin) EXECUTE FUNCTION taff_user_system_admin_members();
--> statement-breakpoint
-- Personal workspace insertion already receives global members from its trigger.
CREATE OR REPLACE FUNCTION taff_provision_user() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE workspace uuid;
BEGIN
  PERFORM set_config('taff.actor_id',NEW.id,true);
  INSERT INTO workspaces(name) VALUES(NEW.name) RETURNING id INTO workspace;
  INSERT INTO members(workspace_id,user_id,name,kind,role) VALUES(workspace,NEW.id,NEW.name,'person','admin')
    ON CONFLICT(workspace_id,user_id) DO UPDATE SET role='admin';
  RETURN NEW;
END;
$$;
--> statement-breakpoint
-- Administrative memberships cannot be removed/demoted by an organization admin.
CREATE FUNCTION taff_system_admin_member_guard() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') AND EXISTS(SELECT 1 FROM users WHERE id=OLD.user_id AND system_admin)
    AND EXISTS(SELECT 1 FROM workspaces WHERE id=OLD.workspace_id) THEN
    IF TG_OP='DELETE' OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.workspace_id IS DISTINCT FROM OLD.workspace_id OR NEW.role <> 'admin' OR NEW.kind <> 'person' THEN
      RAISE EXCEPTION USING MESSAGE='taff_conflict',ERRCODE='P0001';
    END IF;
  END IF;
  IF TG_OP <> 'DELETE' AND EXISTS(SELECT 1 FROM users WHERE id=NEW.user_id AND system_admin) AND (NEW.role <> 'admin' OR NEW.kind <> 'person') THEN
    RAISE EXCEPTION USING MESSAGE='taff_conflict',ERRCODE='P0001';
  END IF;
  IF TG_OP='DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER members_system_admin_guard BEFORE INSERT OR UPDATE OR DELETE ON members FOR EACH ROW EXECUTE FUNCTION taff_system_admin_member_guard();
