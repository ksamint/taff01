-- Backfills are audited under the system migration actor.
SELECT set_config('taff.actor_id', 'system:migration', true);--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN "number" integer;--> statement-breakpoint
ALTER TABLE "workspaces" ADD COLUMN "key" text DEFAULT 'WS' NOT NULL;--> statement-breakpoint
-- Existing workspaces take the first two ASCII letters or digits of their name.
UPDATE "workspaces" SET "key" = COALESCE(NULLIF(upper(left(regexp_replace("name", '[^A-Za-z0-9]', '', 'g'), 2)), ''), 'WS') WHERE length(regexp_replace("name", '[^A-Za-z0-9]', '', 'g')) >= 2;--> statement-breakpoint
-- Existing tasks are numbered in creation order within each workspace.
UPDATE "tasks" t SET "number" = n.number FROM (SELECT id, row_number() OVER (PARTITION BY workspace_id ORDER BY created_at, id) AS number FROM "tasks") n WHERE n.id = t.id;--> statement-breakpoint
ALTER TABLE "tasks" ALTER COLUMN "number" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_workspace_number_unique" UNIQUE("workspace_id","number");
