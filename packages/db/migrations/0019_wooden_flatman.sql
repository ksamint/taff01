CREATE TABLE "sms_auth_challenges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"phone_hash" text NOT NULL,
	"code_hash" text,
	"ready" boolean DEFAULT false NOT NULL,
	"attempts" integer DEFAULT 0 NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"last_sent_at" timestamp with time zone NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"send_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sms_auth_challenges_phone_hash_unique" UNIQUE("phone_hash"),
	CONSTRAINT "sms_auth_challenges_attempts" CHECK ("sms_auth_challenges"."attempts" between 0 and 3),
	CONSTRAINT "sms_auth_challenges_sends" CHECK ("sms_auth_challenges"."send_count" between 1 and 5),
	CONSTRAINT "sms_auth_challenges_hashes" CHECK ("sms_auth_challenges"."phone_hash" ~ '^[a-f0-9]{64}$' and ("sms_auth_challenges"."code_hash" is null or "sms_auth_challenges"."code_hash" ~ '^[a-f0-9]{64}$'))
);
--> statement-breakpoint
CREATE TABLE "sms_auth_limits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bucket" text NOT NULL,
	"window_started_at" timestamp with time zone NOT NULL,
	"count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sms_auth_limits_bucket_unique" UNIQUE("bucket"),
	CONSTRAINT "sms_auth_limits_count" CHECK ("sms_auth_limits"."count" between 1 and 30)
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone_number" text;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "phone_number_verified" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_phone_number_unique" UNIQUE("phone_number");--> statement-breakpoint
-- Hashes/counters remain private: existing audit records only UUID metadata.
CREATE TRIGGER sms_auth_challenges_audit AFTER INSERT OR UPDATE OR DELETE ON sms_auth_challenges FOR EACH ROW EXECUTE FUNCTION taff_audit_change();
--> statement-breakpoint
CREATE TRIGGER sms_auth_limits_audit AFTER INSERT OR UPDATE OR DELETE ON sms_auth_limits FOR EACH ROW EXECUTE FUNCTION taff_audit_change();
