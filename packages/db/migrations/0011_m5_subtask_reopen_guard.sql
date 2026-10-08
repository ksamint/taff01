CREATE OR REPLACE FUNCTION taff_task_planning_guard() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE parent_workspace uuid; parent_status task_status;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.parent_id IS DISTINCT FROM OLD.parent_id THEN RAISE EXCEPTION USING MESSAGE='taff_invalid', ERRCODE='P0001'; END IF;
    NEW.version := OLD.version + 1;
  END IF;
  IF length(NEW.description)>20000 OR cardinality(NEW.labels)>20 OR EXISTS (SELECT 1 FROM unnest(NEW.labels) label WHERE length(btrim(label)) NOT BETWEEN 1 AND 40) OR cardinality(NEW.labels) <> (SELECT count(DISTINCT label) FROM unnest(NEW.labels) label) THEN RAISE EXCEPTION USING MESSAGE='taff_invalid', ERRCODE='P0001'; END IF;
  IF TG_OP = 'INSERT' AND NEW.parent_id IS NOT NULL THEN
    SELECT workspace_id,status INTO parent_workspace,parent_status FROM tasks WHERE id=NEW.parent_id FOR UPDATE;
    IF parent_workspace IS NULL OR parent_workspace <> NEW.workspace_id OR NEW.parent_id=NEW.id THEN RAISE EXCEPTION USING MESSAGE='taff_invalid', ERRCODE='P0001'; END IF;
    IF parent_status='done' THEN RAISE EXCEPTION USING MESSAGE='taff_conflict', ERRCODE='P0001'; END IF;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.parent_id IS NOT NULL AND NEW.status <> 'done' THEN
    SELECT workspace_id,status INTO parent_workspace,parent_status FROM tasks WHERE id=NEW.parent_id FOR UPDATE;
    IF parent_status='done' THEN RAISE EXCEPTION USING MESSAGE='taff_conflict', ERRCODE='P0001'; END IF;
  END IF;
  IF NEW.status='done' AND (TG_OP='INSERT' OR OLD.status <> 'done') AND EXISTS (SELECT 1 FROM tasks WHERE parent_id=NEW.id AND status<>'done') THEN RAISE EXCEPTION USING MESSAGE='taff_conflict', ERRCODE='P0001'; END IF;
  RETURN NEW;
END;
$$;
