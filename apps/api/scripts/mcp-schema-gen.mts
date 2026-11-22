// Emits the MCP tool argument schemas as Draft 7 JSON Schema, the
// single machine-readable contract the Rust backend consumes (ADR 0026).
// Part of `pnpm rust:fixtures`; the local gate regenerates and diffs the output.
import assert from "node:assert/strict";
import { writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { toJSONSchema } from "zod/v4/core";
import { MCP_TOOL_ARGS } from "../src/mcp-tool-args";

const out = Object.fromEntries(
  Object.keys(MCP_TOOL_ARGS)
    .sort()
    .map(
      (name) =>
        [
          name,
          toJSONSchema(MCP_TOOL_ARGS[name as keyof typeof MCP_TOOL_ARGS], {
            target: "draft-7",
            io: "input",
          }),
        ] as const,
    ),
);

assert.equal(Object.keys(out).length, Object.keys(MCP_TOOL_ARGS).length);
for (const [name, schema] of Object.entries(out))
  assert(
    typeof schema === "object" &&
      schema !== null &&
      "type" in schema &&
      schema.type === "object",
    `${name} must expose object arguments`,
  );

const target = fileURLToPath(
  new URL(
    "../../../backend/crates/taff-core/tests/fixtures/mcp-tools.json",
    import.meta.url,
  ),
);
// Keep the existing Rust parity fixture's unversioned representation.
const legacy = Object.fromEntries(
  Object.entries(out).map(([name, { $schema: _draft, ...schema }]) => [
    name,
    schema,
  ]),
);
writeFileSync(target, `${JSON.stringify(legacy, null, 2)}\n`);
writeFileSync(
  new URL(
    "../../../packages/schemas/generated/mcp-tools.json",
    import.meta.url,
  ),
  `${JSON.stringify(out, null, 2)}\n`,
);
console.log(`${Object.keys(out).length} tool schemas -> ${target}`);
