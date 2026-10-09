CREATE TABLE "daily_digests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"workspace_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"local_date" text NOT NULL,
	"time_zone" text NOT NULL,
	"locale" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_digests_user_workspace_day" UNIQUE("user_id","workspace_id","local_date"),
	CONSTRAINT "daily_digests_date" CHECK ("daily_digests"."local_date" ~ '^\d{4}-\d{2}-\d{2}$'),
	CONSTRAINT "daily_digests_locale" CHECK ("daily_digests"."locale" IN ('en','zh-CN','zh-HK'))
);
--> statement-breakpoint
CREATE TABLE "notification_preferences" (
	"id" text PRIMARY KEY NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"review" boolean DEFAULT true NOT NULL,
	"block" boolean DEFAULT true NOT NULL,
	"mention" boolean DEFAULT true NOT NULL,
	"done" boolean DEFAULT true NOT NULL,
	"digest" boolean DEFAULT true NOT NULL,
	"digest_at" text DEFAULT '09:00' NOT NULL,
	"quiet" boolean DEFAULT false NOT NULL,
	"next_digest_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_preferences_version" CHECK ("notification_preferences"."version">0),
	CONSTRAINT "notification_preferences_time" CHECK ("notification_preferences"."digest_at" IN ('08:00','09:00','18:00'))
);
--> statement-breakpoint
ALTER TABLE "inbox_items" DROP CONSTRAINT "inbox_items_kind";--> statement-breakpoint
ALTER TABLE "inbox_items" ADD COLUMN "digest_id" uuid;--> statement-breakpoint
ALTER TABLE "daily_digests" ADD CONSTRAINT "daily_digests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "daily_digests" ADD CONSTRAINT "daily_digests_member_fk" FOREIGN KEY ("workspace_id","member_id") REFERENCES "public"."members"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_id_users_id_fk" FOREIGN KEY ("id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "daily_digests_recipient_date_idx" ON "daily_digests" USING btree ("user_id","workspace_id","local_date");--> statement-breakpoint
CREATE INDEX "notification_preferences_due_idx" ON "notification_preferences" USING btree ("next_digest_at","id");--> statement-breakpoint
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_digest_id_daily_digests_id_fk" FOREIGN KEY ("digest_id") REFERENCES "public"."daily_digests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inbox_items" ADD CONSTRAINT "inbox_items_kind" CHECK ("inbox_items"."kind" IN ('review','blocker','mention','done','digest'));