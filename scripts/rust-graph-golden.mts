import { writeFileSync } from "node:fs";
import { graphImageFixture } from "../packages/schemas/src/graph-image.fixture";

for (const kind of ["mind", "relations"] as const) {
  for (const locale of ["en", "zh-CN", "zh-HK"] as const) {
    writeFileSync(
      new URL(
        `../backend/crates/taff-render/tests/fixtures/graph-${kind}-${locale}.json`,
        import.meta.url,
      ),
      `${JSON.stringify(graphImageFixture(kind, locale), null, 2)}\n`,
    );
  }
  for (const [label, count] of [
    ["empty", 0],
    ["max", 151],
    ["dense", 150],
  ] as const) {
    writeFileSync(
      new URL(
        `../backend/crates/taff-render/tests/fixtures/graph-${kind}-${label}.json`,
        import.meta.url,
      ),
      `${JSON.stringify(graphImageFixture(kind, "zh-HK", count, label === "dense"), null, 2)}\n`,
    );
  }
}
