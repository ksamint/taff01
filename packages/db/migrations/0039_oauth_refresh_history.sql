-- Additive replay ledger: only peppered hashes, never raw refresh tokens.
-- Existing grants keep their IDs, credentials, scopes and workspace bindings.
CREATE TABLE "oauth_refresh_history" (
  "hash" text PRIMARY KEY NOT NULL,
  "token_id" uuid NOT NULL REFERENCES "agent_tokens"("id") ON DELETE cascade,
  "consumed_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "oauth_refresh_history_token_idx" ON "oauth_refresh_history" ("token_id");
