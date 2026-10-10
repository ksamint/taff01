-- Older API images omit number. Keep their writes valid after an image rollback.
CREATE FUNCTION taff_legacy_task_number() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.number IS NULL THEN
    -- Match core.nextTaskNumber: serialize allocation within one workspace.
    PERFORM 1 FROM workspaces WHERE id = NEW.workspace_id FOR UPDATE;
    SELECT coalesce(max(number), 0) + 1 INTO NEW.number
      FROM tasks WHERE workspace_id = NEW.workspace_id;
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
-- BEFORE triggers run by name: planning must lock a parent before allocation
-- locks the workspace, matching the current core's parent -> workspace order.
CREATE TRIGGER tasks_reference_number BEFORE INSERT ON tasks
  FOR EACH ROW EXECUTE FUNCTION taff_legacy_task_number();
