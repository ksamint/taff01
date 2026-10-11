import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createGraphStoreFromEnv, graphFingerprint } from "./graph-store";

const uri = process.env.TEST_NEO4J_URI;
if (
  uri &&
  !["localhost", "127.0.0.1", "[::1]", "neo4j", "taff-graph-qa-neo4j"].includes(
    new URL(uri).hostname,
  )
)
  throw new Error("Neo4j integration tests require an isolated local server");
describe.skipIf(!uri)("real Neo4j projection", () => {
  it("atomically replaces nodes and typed edges without crossing workspaces, then removes them", async () => {
    const store = createGraphStoreFromEnv({
      NEO4J_URI: uri,
      NEO4J_USERNAME: process.env.TEST_NEO4J_USERNAME,
      NEO4J_PASSWORD: process.env.TEST_NEO4J_PASSWORD,
      NEO4J_DATABASE: process.env.TEST_NEO4J_DATABASE,
    })!;
    const workspace = randomUUID();
    const other = randomUUID();
    const task = randomUUID();
    const person = randomUUID();
    const source = {
      nodes: [
        {
          id: task,
          kind: "task" as const,
          label: "T",
          status: "todo" as const,
        },
        { id: person, kind: "person" as const, label: "P" },
      ],
      edges: [{ source: task, target: person, kind: "owner" as const }],
    };
    try {
      expect(await store.read(workspace)).toBeNull();
      await store.replace(workspace, source);
      await store.replace(other, source);
      const projection = await store.read(workspace);
      expect(projection!.fingerprint).toBe(graphFingerprint(source));
      expect(graphFingerprint(projection!)).toBe(graphFingerprint(source));
      await store.replace(workspace, { nodes: [source.nodes[1]], edges: [] });
      expect((await store.read(workspace))!.nodes).toEqual([source.nodes[1]]);
      expect((await store.read(workspace))!.edges).toEqual([]);
      expect((await store.read(other))!.nodes).toHaveLength(2);
      expect(await store.listWorkspaces()).toContain(workspace);
      await store.remove(workspace);
      expect(await store.read(workspace)).toBeNull();
      expect(await store.read(other)).not.toBeNull();
    } finally {
      await store.remove(workspace);
      await store.remove(other);
      await store.close();
    }
  }, 30000);
});
