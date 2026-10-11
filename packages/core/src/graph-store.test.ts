import { describe, expect, it } from "vitest";
import { createGraphStoreFromEnv, graphFingerprint } from "./graph-store";

describe("graph store boundaries", () => {
  it("allows disabled configuration and rejects partial or insecure credentials without exposing them", async () => {
    expect(createGraphStoreFromEnv({})).toBeUndefined();
    for (const env of [
      { NEO4J_URI: "bolt://localhost" },
      {
        NEO4J_URI: "https://localhost",
        NEO4J_USERNAME: "neo4j",
        NEO4J_PASSWORD: "secret-value",
      },
      {
        NEO4J_URI: "bolt://neo4j:secret-value@localhost",
        NEO4J_USERNAME: "neo4j",
        NEO4J_PASSWORD: "secret-value",
      },
      {
        NEO4J_URI: "bolt+ssc://localhost",
        NEO4J_USERNAME: "neo4j",
        NEO4J_PASSWORD: "secret-value",
      },
    ])
      expect(() => createGraphStoreFromEnv(env)).toThrow(
        /^Invalid Neo4j configuration$/,
      );
    const store = createGraphStoreFromEnv({
      NEO4J_URI: "bolt+s://localhost",
      NEO4J_USERNAME: "neo4j",
      NEO4J_PASSWORD: "secret-value",
    });
    await store!.close();
  });
  it("canonicalizes order but detects relationship or title changes", () => {
    const a = { id: "a", kind: "task" as const, label: "A" };
    const b = { id: "b", kind: "person" as const, label: "B" };
    const edges = [{ source: "a", target: "b", kind: "owner" as const }];
    const fingerprint = graphFingerprint({ nodes: [a, b], edges });
    expect(graphFingerprint({ nodes: [b, a], edges })).toBe(fingerprint);
    expect(
      graphFingerprint({ nodes: [a, { ...b, label: "Renamed" }], edges }),
    ).not.toBe(fingerprint);
    expect(graphFingerprint({ nodes: [a, b], edges: [] })).not.toBe(
      fingerprint,
    );
  });
});
