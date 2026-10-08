CREATE TABLE "task_calendar" (
	"id" uuid PRIMARY KEY NOT NULL,
	"workspace_id" uuid NOT NULL,
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone NOT NULL,
	"time_zone" text NOT NULL,
	"rrule" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "task_calendar_duration" CHECK ("task_calendar"."end_at">"task_calendar"."start_at" AND "task_calendar"."end_at"<="task_calendar"."start_at"+interval '7 days'),
	CONSTRAINT "task_calendar_range" CHECK ("task_calendar"."start_at">=timestamptz '1970-01-01T00:00:00Z' AND "task_calendar"."end_at"<timestamptz '2201-01-01T00:00:00Z'),
	CONSTRAINT "task_calendar_timezone" CHECK (length("task_calendar"."time_zone") BETWEEN 1 AND 100),
	CONSTRAINT "task_calendar_rrule" CHECK ("task_calendar"."rrule" IS NULL OR length("task_calendar"."rrule") BETWEEN 1 AND 500)
);
--> statement-breakpoint
ALTER TABLE "task_calendar" ADD CONSTRAINT "task_calendar_task_fk" FOREIGN KEY ("workspace_id","id") REFERENCES "public"."tasks"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "task_calendar_workspace_start_idx" ON "task_calendar" USING btree ("workspace_id","start_at");