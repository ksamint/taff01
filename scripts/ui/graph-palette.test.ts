import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("uses only canonical web palette tokens in the graph renderer", () => {
  const tokens = readFileSync(
    new URL("../../apps/web/src/styles/tokens.css", import.meta.url),
    "utf8",
  );
  const graph = readFileSync(
    new URL("../../backend/crates/taff-render/src/graph.rs", import.meta.url),
    "utf8",
  );
  const colors = [...graph.matchAll(/"(#[a-f0-9]{6})"/g)].map(
    (match) => match[1],
  );
  expect(colors.length).toBeGreaterThan(0);
  for (const color of colors) expect(tokens).toContain(`: ${color};`);
});
