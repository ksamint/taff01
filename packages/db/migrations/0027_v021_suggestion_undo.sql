ALTER TABLE "tasks" ADD COLUMN "archived_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "task_plans" ADD COLUMN "archived_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "suggestions" ADD COLUMN "inverse" jsonb;
--> statement-breakpoint
ALTER TABLE "suggestions" ADD COLUMN "undone_at" timestamp with time zone;
