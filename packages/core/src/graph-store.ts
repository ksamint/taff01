import { createHash } from "node:crypto";
import {
  GRAPH_NODE_LIMIT,
  type GraphEdge,
  type GraphNode,
  workspaceGraphSchema,
} from "@taff/schemas/graph";
import neo4j, { type ManagedTransaction } from "neo4j-driver";
import { z } from "zod";

export type GraphSnapshot = { nodes: GraphNode[]; edges: GraphEdge[] };
export type GraphProjection = GraphSnapshot & {
  fingerprint: string;
  syncedAt: string;
};
export interface GraphStore {
  read(workspaceId: string): Promise<GraphProjection | null>;
  replace(workspaceId: string, snapshot: GraphSnapshot): Promise<void>;
  listWorkspaces(after?: string): Promise<string[]>;
  remove(workspaceId: string): Promise<void>;
  close(): Promise<void>;
}

export function graphFingerprint(snapshot: GraphSnapshot): string {
  return createHash("sha256")
    .update(
      JSON.stringify({
        nodes: snapshot.nodes
          .map(({ id, kind, label, status }) => ({
            id,
            kind,
            label,
            ...(status ? { status } : {}),
          }))
          .sort((a, b) => a.id.localeCompare(b.id)),
        edges: snapshot.edges
          .map(({ source, target, kind }) => ({ source, target, kind }))
          .sort((a, b) =>
            `${a.source}:${a.kind}:${a.target}`.localeCompare(
              `${b.source}:${b.kind}:${b.target}`,
            ),
          ),
      }),
    )
    .digest("hex");
}

export function createGraphStoreFromEnv(
  env: NodeJS.ProcessEnv,
): GraphStore | undefined {
  const keys = ["NEO4J_URI", "NEO4J_USERNAME", "NEO4J_PASSWORD"] as const;
  if (!keys.some((key) => env[key])) return undefined;
  const config = z
    .object({
      NEO4J_URI: z.url().refine((value) => {
        const url = new URL(value);
        return (
          ["bolt:", "bolt+s:", "neo4j:", "neo4j+s:"].includes(url.protocol) &&
          !url.username &&
          !url.password &&
          !url.search &&
          !url.hash &&
          (!url.pathname || url.pathname === "/")
        );
      }),
      NEO4J_USERNAME: z.string().min(1),
      NEO4J_PASSWORD: z.string().min(1),
      NEO4J_DATABASE: z.string().min(1).default("neo4j"),
    })
    .safeParse({ ...env, NEO4J_DATABASE: env.NEO4J_DATABASE || undefined });
  if (!config.success) throw new Error("Invalid Neo4j configuration");
  const driver = neo4j.driver(
    config.data.NEO4J_URI,
    neo4j.auth.basic(config.data.NEO4J_USERNAME, config.data.NEO4J_PASSWORD),
    {
      connectionTimeout: 3000,
      connectionAcquisitionTimeout: 5000,
      maxTransactionRetryTime: 3000,
      maxConnectionPoolSize: 5,
    },
  );
  async function execute<T>(
    write: boolean,
    run: (tx: ManagedTransaction) => Promise<T>,
  ): Promise<T> {
    const session = driver.session({ database: config.data!.NEO4J_DATABASE });
    try {
      return await (write
        ? session.executeWrite(run, { timeout: 10000 })
        : session.executeRead(run, { timeout: 5000 }));
    } finally {
      await session.close();
    }
  }
  let initialized: Promise<void> | undefined;
  function initialize() {
    initialized ??= (async () => {
      await execute(true, async (tx) => {
        await tx.run(
          "CREATE CONSTRAINT taff_workspace_key IF NOT EXISTS FOR (w:TaffWorkspace) REQUIRE w.key IS UNIQUE",
        );
        await tx.run(
          "CREATE CONSTRAINT taff_entity_key IF NOT EXISTS FOR (n:TaffEntity) REQUIRE n.key IS UNIQUE",
        );
      });
    })().catch((error) => {
      initialized = undefined;
      throw error;
    });
    return initialized;
  }
  async function clear(tx: ManagedTransaction, workspaceId: string) {
    await tx.run(
      "MATCH (n:TaffEntity {workspaceId:$workspaceId}) DETACH DELETE n",
      { workspaceId },
    );
  }
  return {
    async read(workspaceId) {
      return execute(false, async (tx) => {
        const result = await tx.run(
          `MATCH (w:TaffWorkspace {key:$workspaceId})
          CALL { WITH w MATCH (n:TaffEntity {workspaceId:w.key}) WITH n LIMIT $nodeLimit
            RETURN collect(n { .id, .kind, .label, .status }) AS nodes }
          CALL { WITH w MATCH (a:TaffEntity {workspaceId:w.key})-[r:PROJECT|PARENT|OWNER|WORKER]->(b:TaffEntity {workspaceId:w.key})
            WITH a,b,r LIMIT $edgeLimit
            RETURN collect({source:a.id,target:b.id,kind:toLower(type(r))}) AS edges }
          RETURN w.fingerprint AS fingerprint,w.syncedAt AS syncedAt,nodes,edges`,
          {
            workspaceId,
            nodeLimit: neo4j.int(GRAPH_NODE_LIMIT + 1),
            edgeLimit: neo4j.int(GRAPH_NODE_LIMIT * 4 + 1),
          },
        );
        const record = result.records[0];
        if (!record) return null;
        const parsed = workspaceGraphSchema.parse({
          workspaceId,
          status: "ready",
          syncedAt: record.get("syncedAt"),
          nodeLimit: GRAPH_NODE_LIMIT,
          nodes: record
            .get("nodes")
            .map((node: GraphNode & { status: string | null }) => ({
              ...node,
              status: node.status ?? undefined,
            })),
          edges: record.get("edges"),
        });
        return {
          nodes: parsed.nodes,
          edges: parsed.edges,
          syncedAt: parsed.syncedAt!,
          fingerprint: z.string().parse(record.get("fingerprint")),
        };
      });
    },
    async replace(workspaceId, snapshot) {
      await initialize();
      await execute(true, async (tx) => {
        // Taking the marker write lock serializes replacements for this workspace.
        await tx.run(
          "MERGE (w:TaffWorkspace {key:$workspaceId}) SET w.lock = coalesce(w.lock,0) + 1",
          { workspaceId },
        );
        await clear(tx, workspaceId);
        await tx.run(
          "UNWIND $nodes AS n CREATE (e:TaffEntity) SET e = n, e.workspaceId = $workspaceId, e.key = $workspaceId + ':' + n.id",
          { workspaceId, nodes: snapshot.nodes },
        );
        for (const kind of ["project", "parent", "owner", "worker"] as const) {
          await tx.run(
            `UNWIND $edges AS e MATCH (a:TaffEntity {key:$workspaceId + ':' + e.source}), (b:TaffEntity {key:$workspaceId + ':' + e.target}) CREATE (a)-[:${kind.toUpperCase()}]->(b)`,
            {
              workspaceId,
              edges: snapshot.edges.filter((edge) => edge.kind === kind),
            },
          );
        }
        await tx.run(
          "MATCH (w:TaffWorkspace {key:$workspaceId}) SET w.fingerprint = $fingerprint, w.syncedAt = $syncedAt",
          {
            workspaceId,
            fingerprint: graphFingerprint(snapshot),
            syncedAt: new Date().toISOString(),
          },
        );
      });
    },
    async listWorkspaces(after = "") {
      return execute(false, async (tx) => {
        const result = await tx.run(
          "MATCH (w:TaffWorkspace) WHERE w.key > $after RETURN w.key AS id ORDER BY id LIMIT 100",
          { after },
        );
        return result.records.map((record) =>
          z.string().uuid().parse(record.get("id")),
        );
      });
    },
    async remove(workspaceId) {
      await execute(true, async (tx) => {
        await tx.run(
          "MATCH (w:TaffWorkspace {key:$workspaceId}) SET w.lock = coalesce(w.lock,0) + 1",
          { workspaceId },
        );
        await clear(tx, workspaceId);
        await tx.run("MATCH (w:TaffWorkspace {key:$workspaceId}) DELETE w", {
          workspaceId,
        });
      });
    },
    close: () => driver.close(),
  };
}
