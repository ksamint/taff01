// Emits the MCP tool argument schemas as JSON Schema (jsonSchema7), the
// single machine-readable contract the Rust backend consumes (ADR 0026).
// Part of `pnpm rust:fixtures`; CI regenerates and diffs the output.
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { toJSONSchema } from "zod/v4/core";
import { MCP_TOOL_ARGS } from "../src/mcp-tool-args";

const out: Record<string, unknown> = {};
for (const name of Object.keys(MCP_TOOL_ARGS).sort()) {
  out[name] = toJSONSchema(MCP_TOOL_ARGS[name as keyof typeof MCP_TOOL_ARGS], {
    target: "jsonSchema7",
    io: "input",
  });
}

const target = fileURLToPath(
  new URL(
    "../../../backend/crates/taff-core/tests/fixtures/mcp-tools.json",
    import.meta.url,
  ),
);
writeFileSync(target, `${JSON.stringify(out, null, 2)}\n`);
console.log(`${Object.keys(out).length} tool schemas -> ${target}`);
