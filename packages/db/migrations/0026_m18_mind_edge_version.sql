ALTER TABLE "mind_edges" ADD COLUMN "version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "mind_edges" ADD CONSTRAINT "mind_edges_version" CHECK ("mind_edges"."version" > 0);