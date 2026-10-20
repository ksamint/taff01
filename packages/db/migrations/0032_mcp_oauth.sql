-- OAuth 2.1 for MCP (ADR 0022). Registered public clients; no secrets.
CREATE TABLE "oauth_clients" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"redirect_uris" text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_clients_name" CHECK (length(btrim("oauth_clients"."name")) BETWEEN 1 AND 100),
	CONSTRAINT "oauth_clients_redirects" CHECK (cardinality("oauth_clients"."redirect_uris") BETWEEN 1 AND 5)
);
--> statement-breakpoint
-- Single-use authorization codes, stored as peppered hashes, 10 minutes.
CREATE TABLE "oauth_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"hash" text NOT NULL,
	"client_id" text NOT NULL,
	"workspace_id" uuid NOT NULL,
	"member_id" uuid NOT NULL,
	"created_by" uuid NOT NULL,
	"scopes" text[] NOT NULL,
	"redirect_uri" text NOT NULL,
	"code_challenge" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"token_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "oauth_codes_hash_unique" UNIQUE("hash")
);
--> statement-breakpoint
ALTER TABLE "oauth_codes" ADD CONSTRAINT "oauth_codes_client_fk" FOREIGN KEY ("client_id") REFERENCES "public"."oauth_clients"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "oauth_codes" ADD CONSTRAINT "oauth_codes_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "oauth_codes" ADD CONSTRAINT "oauth_codes_member_fk" FOREIGN KEY ("workspace_id","member_id") REFERENCES "public"."members"("workspace_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "oauth_codes" ADD CONSTRAINT "oauth_codes_creator_fk" FOREIGN KEY ("workspace_id","created_by") REFERENCES "public"."members"("workspace_id","id") ON DELETE cascade ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "oauth_codes" ADD CONSTRAINT "oauth_codes_token_fk" FOREIGN KEY ("token_id") REFERENCES "public"."agent_tokens"("id") ON DELETE set null ON UPDATE no action;
--> statement-breakpoint
-- An OAuth grant is an agent token with an expiring access token and a
-- rotating refresh token. Personal tokens keep all four columns null.
ALTER TABLE "agent_tokens" ADD COLUMN "oauth_client_id" text;
--> statement-breakpoint
ALTER TABLE "agent_tokens" ADD COLUMN "expires_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "agent_tokens" ADD COLUMN "refresh_hash" text;
--> statement-breakpoint
ALTER TABLE "agent_tokens" ADD COLUMN "refresh_expires_at" timestamp with time zone;
--> statement-breakpoint
ALTER TABLE "agent_tokens" ADD CONSTRAINT "agent_tokens_refresh_hash_unique" UNIQUE("refresh_hash");
--> statement-breakpoint
ALTER TABLE "agent_tokens" ADD CONSTRAINT "agent_tokens_oauth_client_fk" FOREIGN KEY ("oauth_client_id") REFERENCES "public"."oauth_clients"("id") ON DELETE no action ON UPDATE no action;
--> statement-breakpoint
ALTER TABLE "agent_tokens" ADD CONSTRAINT "agent_tokens_oauth_shape" CHECK (("agent_tokens"."oauth_client_id" IS NULL AND "agent_tokens"."expires_at" IS NULL AND "agent_tokens"."refresh_hash" IS NULL AND "agent_tokens"."refresh_expires_at" IS NULL) OR ("agent_tokens"."oauth_client_id" IS NOT NULL AND "agent_tokens"."expires_at" IS NOT NULL AND "agent_tokens"."refresh_expires_at" IS NOT NULL));
