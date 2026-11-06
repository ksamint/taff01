import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { buildSummaryLayout } from "../packages/core/src/summary-layout";
import { summaryTranslate } from "../packages/core/src/summary-messages";
import { summaryWatermark } from "../packages/core/src/summary-model";
import { renderSummaryText } from "../packages/core/src/summary-text";
import { dailySummarySnapshotSchema } from "../packages/schemas/src/index";

const base = new URL("../packages/core/src/__fixtures__/", import.meta.url);
const fixture = JSON.parse(
  readFileSync(new URL("summary-golden.json", base), "utf8"),
);
const snapshot = dailySummarySnapshotSchema.parse(fixture.snapshot);
const createdAt = "2026-10-08T12:00:00.000Z";
const renderDir = new URL(
  "../backend/crates/taff-render/tests/fixtures/",
  import.meta.url,
);
mkdirSync(renderDir, { recursive: true });
const write = (name: string, value: unknown) =>
  writeFileSync(
    new URL(name, renderDir),
    `${JSON.stringify(value, null, 2)}\n`,
  );
for (const locale of ["en", "zh-CN", "zh-HK"] as const) {
  const t = summaryTranslate(locale);
  const watermark = summaryWatermark(snapshot, null);
  const text = renderSummaryText(
    snapshot,
    watermark,
    fixture.contentHash,
    createdAt,
    locale,
    t,
  );
  writeFileSync(new URL(`summary-text-${locale}.txt`, base), text);
  // image-1 input (rasterized text), kept for the one-release compatibility window.
  write(`summary-${locale}.json`, {
    snapshot,
    watermark,
    contentHash: fixture.contentHash,
    createdAt,
    locale,
    text,
    formattedCreatedAt: new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: snapshot.timeZone,
    }).format(new Date(createdAt)),
  });
  // image-2 input: the shared display layout.
  write(`summary-layout-${locale}.json`, {
    layout: buildSummaryLayout(
      snapshot,
      watermark,
      fixture.contentHash,
      createdAt,
      locale,
      t,
    ),
    watermark,
    contentHash: fixture.contentHash,
  });
}
