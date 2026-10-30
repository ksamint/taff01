ALTER TABLE projects ADD COLUMN due_at timestamptz;
--> statement-breakpoint
ALTER TABLE projects ADD COLUMN delivery_progress integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE projects ADD CONSTRAINT projects_delivery_progress CHECK (delivery_progress BETWEEN 0 AND 100);
