import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { summaryTranslate } from "../packages/core/src/summary-messages";
import { summaryWatermark } from "../packages/core/src/summary-model";
import { renderSummaryText } from "../packages/core/src/summary-text";
import { dailySummarySnapshotSchema } from "../packages/schemas/src/index";

const base = new URL("../packages/core/src/__fixtures__/", import.meta.url);
const fixture = JSON.parse(
  readFileSync(new URL("summary-golden.json", base), "utf8"),
);
const snapshot = dailySummarySnapshotSchema.parse(fixture.snapshot);
for (const locale of ["en", "zh-CN", "zh-HK"] as const) {
  const text = renderSummaryText(
    snapshot,
    summaryWatermark(snapshot, null),
    fixture.contentHash,
    "2026-10-08T12:00:00.000Z",
    locale,
    summaryTranslate(locale),
  );
  writeFileSync(new URL(`summary-text-${locale}.txt`, base), text);
  const renderDir = new URL(
    "../backend/crates/taff-render/tests/fixtures/",
    import.meta.url,
  );
  mkdirSync(renderDir, { recursive: true });
  writeFileSync(
    new URL(`summary-${locale}.json`, renderDir),
    `${JSON.stringify({ snapshot, watermark: summaryWatermark(snapshot, null), contentHash: fixture.contentHash, createdAt: "2026-10-08T12:00:00.000Z", locale, text, formattedCreatedAt: new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: snapshot.timeZone }).format(new Date("2026-10-08T12:00:00.000Z")) }, null, 2)}\n`,
  );
}
