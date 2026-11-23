CREATE TABLE "member_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"rate_micros_per_hour" bigint NOT NULL,
	"currency" text NOT NULL,
	"valid_from" date NOT NULL,
	CONSTRAINT "member_rates_effective_date_unique" UNIQUE("workspace_id","person_id","valid_from"),
	CONSTRAINT "member_rates_amount_check" CHECK ("member_rates"."rate_micros_per_hour" BETWEEN 0 AND 9007199254740991),
	CONSTRAINT "member_rates_currency_check" CHECK ("member_rates"."currency" ~ '^[A-Z]{3}$'),
	CONSTRAINT "member_rates_day_check" CHECK ("member_rates"."valid_from" BETWEEN DATE '0001-01-01' AND DATE '9999-12-31')
);
--> statement-breakpoint
CREATE TABLE "time_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"task_id" uuid NOT NULL,
	"person_id" uuid NOT NULL,
	"minutes" integer NOT NULL,
	"day" date NOT NULL,
	"note" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "time_entries_minutes_check" CHECK ("time_entries"."minutes" BETWEEN 1 AND 1440),
	CONSTRAINT "time_entries_note_check" CHECK (char_length("time_entries"."note") <= 2000),
	CONSTRAINT "time_entries_day_check" CHECK ("time_entries"."day" BETWEEN DATE '0001-01-01' AND DATE '9999-12-31')
);
--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "time_zone" text DEFAULT 'UTC' NOT NULL;--> statement-breakpoint
ALTER TABLE "member_rates" ADD CONSTRAINT "member_rates_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "time_entries" ADD CONSTRAINT "time_entries_task_fk" FOREIGN KEY ("workspace_id","task_id") REFERENCES "public"."tasks"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "time_entries_person_day_idx" ON "time_entries" USING btree ("workspace_id","person_id","day" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "time_entries_task_day_idx" ON "time_entries" USING btree ("workspace_id","task_id","day" DESC NULLS LAST);
--> statement-breakpoint
CREATE FUNCTION taff_audit_time_tracking_change() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  row_data jsonb;
  actor text;
  workspace uuid;
  entry_owner uuid;
  resource text;
  action text;
  change_id uuid;
  recipient text;
BEGIN
  IF TG_OP = 'DELETE' THEN row_data := to_jsonb(OLD); ELSE row_data := to_jsonb(NEW); END IF;
  actor := nullif(current_setting('taff.actor_id', true), '');
  IF actor IS NULL THEN RAISE EXCEPTION 'Taff mutation requires an actor'; END IF;
  workspace := (row_data->>'workspace_id')::uuid;
  entry_owner := (row_data->>'person_id')::uuid;
  resource := row_data->>'id';
  action := TG_TABLE_NAME || '.' || lower(TG_OP);
  INSERT INTO activity(actor_id, workspace_id, action, resource_id, details)
    VALUES (actor, workspace, action, resource, '{}') RETURNING id INTO change_id;
  FOR recipient IN
    SELECT DISTINCT user_id FROM members
      WHERE workspace_id = workspace AND kind = 'person' AND user_id IS NOT NULL
        AND (id = entry_owner OR role = 'admin')
  LOOP
    PERFORM pg_notify('taff_changes', jsonb_build_object(
      'activityId', change_id, 'workspaceId', workspace, 'resourceId', resource,
      'action', action, 'actorId', actor, 'userId', recipient, 'recipientOnly', true
    )::text);
  END LOOP;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER "time_entries_audit_change" AFTER INSERT OR UPDATE OR DELETE ON "time_entries"
FOR EACH ROW EXECUTE FUNCTION taff_audit_time_tracking_change();
--> statement-breakpoint
CREATE TRIGGER "member_rates_audit_change" AFTER INSERT OR UPDATE OR DELETE ON "member_rates"
FOR EACH ROW EXECUTE FUNCTION taff_audit_time_tracking_change();
