import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MCP_TOOLS, ROUND_TRIP_SCOPES, toolJson } from "./mcp-round-trip";

describe("MCP round trip helpers", () => {
  it("parses the JSON text block of a tool result", () => {
    expect(
      toolJson({
        content: [
          { type: "image" },
          { type: "text", text: '{"id":"t1","status":"done"}' },
        ],
      }),
    ).toEqual({ id: "t1", status: "done" });
    expect(toolJson({ content: [{ type: "text" }] })).toBeNull();
    expect(toolJson({ content: [] })).toBeNull();
  });

  it("expects exactly the tools the server registers, sorted", () => {
    expect([...MCP_TOOLS]).toEqual([...MCP_TOOLS].sort());
    const sources = [
      "../src/mcp.ts",
      "../src/mcp-timeline.ts",
      "../src/mcp-crm.ts",
    ]
      .map((path) => readFileSync(new URL(path, import.meta.url), "utf8"))
      .join("\n");
    const registered = [
      ...sources.matchAll(/registerTool\(\s*"([a-z_.]+)"/g),
    ].map((match) => match[1]);
    expect(registered.sort()).toEqual([...MCP_TOOLS]);
  });

  it("asks for every scope the round trip uses", () => {
    expect(ROUND_TRIP_SCOPES).toEqual([
      "tasks:read",
      "tasks:write",
      "calendar:write",
      "inbox:review",
      "files:write",
    ]);
  });
});
