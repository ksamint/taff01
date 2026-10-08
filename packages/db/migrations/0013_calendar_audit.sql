CREATE TRIGGER task_calendar_audit AFTER INSERT OR UPDATE OR DELETE ON task_calendar FOR EACH ROW EXECUTE FUNCTION taff_audit_change();
