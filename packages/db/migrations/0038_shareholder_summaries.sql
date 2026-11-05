CREATE TABLE "audience_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"org" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"archived_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audience_tags_workspace_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "audience_tags_kind" CHECK ("kind" IN ('shareholder')),
	CONSTRAINT "audience_tags_org" CHECK (length(btrim("org")) BETWEEN 1 AND 100),
	CONSTRAINT "audience_tags_label" CHECK (length("label") <= 100),
	CONSTRAINT "audience_tags_version" CHECK ("version" > 0)
);
--> statement-breakpoint
CREATE TABLE "project_audience_tags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"project_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_audience_tags_link_unique" UNIQUE("workspace_id","project_id","tag_id")
);
--> statement-breakpoint
CREATE TABLE "audience_recipients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"name" text NOT NULL,
	"contact_id" uuid,
	"user_id" text,
	"locale" text NOT NULL,
	"time_zone" text NOT NULL,
	"deliver_at" text NOT NULL,
	"include_finance" boolean DEFAULT false NOT NULL,
	"show_people" boolean DEFAULT true NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"next_due_at" timestamp (3) with time zone NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audience_recipients_workspace_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "audience_recipients_name" CHECK (length(btrim("name")) BETWEEN 1 AND 100),
	CONSTRAINT "audience_recipients_locale" CHECK ("locale" IN ('en','zh-CN','zh-HK')),
	CONSTRAINT "audience_recipients_deliver_at" CHECK ("deliver_at" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
	CONSTRAINT "audience_recipients_version" CHECK ("version" > 0)
);
--> statement-breakpoint
CREATE TABLE "daily_summaries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"tag_id" uuid NOT NULL,
	"recipient_id" uuid NOT NULL,
	"local_date" text NOT NULL,
	"time_zone" text NOT NULL,
	"locale" text NOT NULL,
	"snapshot" jsonb NOT NULL,
	"watermark" jsonb NOT NULL,
	"content_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "daily_summaries_workspace_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "daily_summaries_recipient_day" UNIQUE("recipient_id","local_date"),
	CONSTRAINT "daily_summaries_date" CHECK ("local_date" ~ '^\d{4}-\d{2}-\d{2}$'),
	CONSTRAINT "daily_summaries_locale" CHECK ("locale" IN ('en','zh-CN','zh-HK')),
	CONSTRAINT "daily_summaries_hash" CHECK ("content_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "summary_shares" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"summary_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"created_by" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"revoked_by" uuid,
	"view_count" integer DEFAULT 0 NOT NULL,
	"last_viewed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "summary_shares_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "summary_shares_hash" CHECK ("token_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "summary_shares_views" CHECK ("view_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "audience_tags" ADD CONSTRAINT "audience_tags_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_audience_tags" ADD CONSTRAINT "project_audience_tags_project_fk" FOREIGN KEY ("workspace_id","project_id") REFERENCES "public"."projects"("workspace_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_audience_tags" ADD CONSTRAINT "project_audience_tags_tag_fk" FOREIGN KEY ("workspace_id","tag_id") REFERENCES "public"."audience_tags"("workspace_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "project_audience_tags" ADD CONSTRAINT "project_audience_tags_creator_fk" FOREIGN KEY ("workspace_id","created_by") REFERENCES "public"."members"("workspace_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "audience_recipients" ADD CONSTRAINT "audience_recipients_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "audience_recipients" ADD CONSTRAINT "audience_recipients_tag_fk" FOREIGN KEY ("workspace_id","tag_id") REFERENCES "public"."audience_tags"("workspace_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "audience_recipients" ADD CONSTRAINT "audience_recipients_contact_fk" FOREIGN KEY ("workspace_id","contact_id") REFERENCES "public"."contacts"("workspace_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "daily_summaries" ADD CONSTRAINT "daily_summaries_tag_fk" FOREIGN KEY ("workspace_id","tag_id") REFERENCES "public"."audience_tags"("workspace_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "daily_summaries" ADD CONSTRAINT "daily_summaries_recipient_fk" FOREIGN KEY ("workspace_id","recipient_id") REFERENCES "public"."audience_recipients"("workspace_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "summary_shares" ADD CONSTRAINT "summary_shares_summary_fk" FOREIGN KEY ("workspace_id","summary_id") REFERENCES "public"."daily_summaries"("workspace_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "summary_shares" ADD CONSTRAINT "summary_shares_creator_fk" FOREIGN KEY ("workspace_id","created_by") REFERENCES "public"."members"("workspace_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "summary_shares" ADD CONSTRAINT "summary_shares_revoker_fk" FOREIGN KEY ("workspace_id","revoked_by") REFERENCES "public"."members"("workspace_id","id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
CREATE UNIQUE INDEX "audience_tags_workspace_kind_org_idx" ON "audience_tags" USING btree ("workspace_id","kind",lower("org"));
--> statement-breakpoint
CREATE INDEX "project_audience_tags_tag_idx" ON "project_audience_tags" USING btree ("workspace_id","tag_id");
--> statement-breakpoint
CREATE UNIQUE INDEX "audience_recipients_tag_user_idx" ON "audience_recipients" USING btree ("tag_id","user_id") WHERE "user_id" IS NOT NULL;
--> statement-breakpoint
CREATE INDEX "audience_recipients_due_idx" ON "audience_recipients" USING btree ("enabled","next_due_at","id");
--> statement-breakpoint
CREATE INDEX "daily_summaries_workspace_tag_date_idx" ON "daily_summaries" USING btree ("workspace_id","tag_id","local_date");
--> statement-breakpoint
CREATE INDEX "summary_shares_summary_idx" ON "summary_shares" USING btree ("workspace_id","summary_id");
--> statement-breakpoint
CREATE FUNCTION taff_summary_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Daily summaries are immutable' USING ERRCODE = '23514';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER daily_summaries_immutable BEFORE UPDATE ON daily_summaries FOR EACH ROW EXECUTE FUNCTION taff_summary_immutable();
--> statement-breakpoint
CREATE TRIGGER audience_tags_audit AFTER INSERT OR UPDATE OR DELETE ON audience_tags FOR EACH ROW EXECUTE FUNCTION taff_audit_change();
--> statement-breakpoint
CREATE TRIGGER project_audience_tags_audit AFTER INSERT OR UPDATE OR DELETE ON project_audience_tags FOR EACH ROW EXECUTE FUNCTION taff_audit_change();
--> statement-breakpoint
CREATE TRIGGER audience_recipients_audit AFTER INSERT OR UPDATE OR DELETE ON audience_recipients FOR EACH ROW EXECUTE FUNCTION taff_audit_change();
--> statement-breakpoint
CREATE TRIGGER daily_summaries_audit AFTER INSERT OR UPDATE OR DELETE ON daily_summaries FOR EACH ROW EXECUTE FUNCTION taff_audit_change();
--> statement-breakpoint
CREATE TRIGGER summary_shares_audit AFTER INSERT OR UPDATE OR DELETE ON summary_shares FOR EACH ROW EXECUTE FUNCTION taff_audit_change();
