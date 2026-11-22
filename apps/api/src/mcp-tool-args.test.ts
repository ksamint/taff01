import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { toJSONSchema } from "zod/v4/core";
import { MCP_TOOLS } from "../scripts/mcp-round-trip";
import { MCP_TOOL_ARGS } from "./mcp-tool-args";

describe("MCP tool argument map", () => {
  it("lists exactly the tools the round trip exercises", () => {
    expect(Object.keys(MCP_TOOL_ARGS).sort()).toEqual([...MCP_TOOLS].sort());
  });

  it("publishes current argument schemas for every registered tool", () => {
    const published = JSON.parse(
      readFileSync(
        new URL(
          "../../../packages/schemas/generated/mcp-tools.json",
          import.meta.url,
        ),
        "utf8",
      ),
    );
    expect(published).toEqual(
      Object.fromEntries(
        Object.entries(MCP_TOOL_ARGS).map(([name, schema]) => [
          name,
          toJSONSchema(schema, { target: "draft-7", io: "input" }),
        ]),
      ),
    );
  });
});
