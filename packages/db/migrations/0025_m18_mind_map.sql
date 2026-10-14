CREATE TABLE "mind_edges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"from_node_id" uuid NOT NULL,
	"to_node_id" uuid NOT NULL,
	"kind" text DEFAULT 'relates' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mind_edges_workspace_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "mind_edges_pair_unique" UNIQUE("workspace_id","from_node_id","to_node_id"),
	CONSTRAINT "mind_edges_self" CHECK ("mind_edges"."from_node_id" <> "mind_edges"."to_node_id"),
	CONSTRAINT "mind_edges_kind" CHECK ("mind_edges"."kind" IN ('relates','supports','contradicts'))
);
--> statement-breakpoint
CREATE TABLE "mind_node_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"node_id" uuid NOT NULL,
	"source_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mind_node_sources_workspace_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "mind_node_sources_link_unique" UNIQUE("workspace_id","node_id","source_id")
);
--> statement-breakpoint
CREATE TABLE "mind_nodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"title" text NOT NULL,
	"layer" integer NOT NULL,
	"angle" numeric(5, 2) NOT NULL,
	"strength" integer DEFAULT 3 NOT NULL,
	"momentum" integer DEFAULT 0 NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"task_id" uuid,
	"archived_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mind_nodes_workspace_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "mind_nodes_title" CHECK (length(btrim("mind_nodes"."title")) BETWEEN 1 AND 200),
	CONSTRAINT "mind_nodes_layer" CHECK ("mind_nodes"."layer" BETWEEN 0 AND 9),
	CONSTRAINT "mind_nodes_angle" CHECK ("mind_nodes"."angle" >= 0 AND "mind_nodes"."angle" < 360),
	CONSTRAINT "mind_nodes_strength" CHECK ("mind_nodes"."strength" BETWEEN 1 AND 5),
	CONSTRAINT "mind_nodes_momentum" CHECK ("mind_nodes"."momentum" BETWEEN -2 AND 2),
	CONSTRAINT "mind_nodes_note" CHECK (length("mind_nodes"."note") <= 4000),
	CONSTRAINT "mind_nodes_version" CHECK ("mind_nodes"."version" > 0)
);
--> statement-breakpoint
CREATE TABLE "mind_sources" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"title" text NOT NULL,
	"url" text,
	"note" text DEFAULT '' NOT NULL,
	"archived_at" timestamp with time zone,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "mind_sources_workspace_id_unique" UNIQUE("workspace_id","id"),
	CONSTRAINT "mind_sources_title" CHECK (length(btrim("mind_sources"."title")) BETWEEN 1 AND 300),
	CONSTRAINT "mind_sources_url" CHECK ("mind_sources"."url" IS NULL OR ("mind_sources"."url" ~ '^https?://' AND length("mind_sources"."url") <= 2000)),
	CONSTRAINT "mind_sources_note" CHECK (length("mind_sources"."note") <= 4000),
	CONSTRAINT "mind_sources_version" CHECK ("mind_sources"."version" > 0)
);
--> statement-breakpoint
ALTER TABLE "mind_edges" ADD CONSTRAINT "mind_edges_from_fk" FOREIGN KEY ("workspace_id","from_node_id") REFERENCES "public"."mind_nodes"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mind_edges" ADD CONSTRAINT "mind_edges_to_fk" FOREIGN KEY ("workspace_id","to_node_id") REFERENCES "public"."mind_nodes"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mind_node_sources" ADD CONSTRAINT "mind_node_sources_node_fk" FOREIGN KEY ("workspace_id","node_id") REFERENCES "public"."mind_nodes"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mind_node_sources" ADD CONSTRAINT "mind_node_sources_source_fk" FOREIGN KEY ("workspace_id","source_id") REFERENCES "public"."mind_sources"("workspace_id","id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mind_nodes" ADD CONSTRAINT "mind_nodes_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mind_nodes" ADD CONSTRAINT "mind_nodes_task_fk" FOREIGN KEY ("workspace_id","task_id") REFERENCES "public"."tasks"("workspace_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mind_sources" ADD CONSTRAINT "mind_sources_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "mind_edges_to_idx" ON "mind_edges" USING btree ("workspace_id","to_node_id");--> statement-breakpoint
CREATE INDEX "mind_node_sources_source_idx" ON "mind_node_sources" USING btree ("workspace_id","source_id");--> statement-breakpoint
CREATE INDEX "mind_nodes_workspace_idx" ON "mind_nodes" USING btree ("workspace_id","layer");--> statement-breakpoint
CREATE TRIGGER mind_nodes_audit AFTER INSERT OR UPDATE OR DELETE ON mind_nodes FOR EACH ROW EXECUTE FUNCTION taff_audit_change();
--> statement-breakpoint
CREATE TRIGGER mind_edges_audit AFTER INSERT OR UPDATE OR DELETE ON mind_edges FOR EACH ROW EXECUTE FUNCTION taff_audit_change();
--> statement-breakpoint
CREATE TRIGGER mind_sources_audit AFTER INSERT OR UPDATE OR DELETE ON mind_sources FOR EACH ROW EXECUTE FUNCTION taff_audit_change();
--> statement-breakpoint
CREATE TRIGGER mind_node_sources_audit AFTER INSERT OR UPDATE OR DELETE ON mind_node_sources FOR EACH ROW EXECUTE FUNCTION taff_audit_change();
