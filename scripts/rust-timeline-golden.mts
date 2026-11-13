import { writeFileSync } from "node:fs";
import { timelineImageFixture } from "../packages/schemas/src/timeline-image.fixture";

for (const locale of ["en", "zh-CN", "zh-HK"] as const) {
  writeFileSync(
    new URL(
      `../backend/crates/taff-render/tests/fixtures/timeline-${locale}.json`,
      import.meta.url,
    ),
    `${JSON.stringify(timelineImageFixture(locale), null, 2)}\n`,
  );
}
