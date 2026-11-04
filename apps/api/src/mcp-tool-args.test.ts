import { describe, expect, it } from "vitest";
import { MCP_TOOLS } from "../scripts/mcp-round-trip";
import { MCP_TOOL_ARGS } from "./mcp-tool-args";

describe("MCP tool argument map", () => {
  it("lists exactly the tools the round trip exercises", () => {
    expect(Object.keys(MCP_TOOL_ARGS).sort()).toEqual([...MCP_TOOLS].sort());
  });
});
