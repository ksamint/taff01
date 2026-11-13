import { writeFileSync } from "node:fs";
import { calendarImageFixture } from "../packages/schemas/src/calendar-image.fixture";

for (const locale of ["en", "zh-CN", "zh-HK"] as const) {
  for (const mode of ["week", "month"] as const) {
    writeFileSync(
      new URL(
        `../backend/crates/taff-render/tests/fixtures/calendar-${mode}-${locale}.json`,
        import.meta.url,
      ),
      `${JSON.stringify(calendarImageFixture(locale, mode), null, 2)}\n`,
    );
  }
}
