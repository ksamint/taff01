import { mkdirSync, writeFileSync } from "node:fs";
import { toJSONSchema } from "zod/v4/core";
import { summaryImageInputSchema } from "../../../packages/schemas/src/summary-image";

const dir = new URL("../../../packages/schemas/generated/", import.meta.url);
mkdirSync(dir, { recursive: true });
writeFileSync(
  new URL("daily-summary.json", dir),
  `${JSON.stringify(toJSONSchema(summaryImageInputSchema, { target: "draft-7", io: "input" }), null, 2)}\n`,
);

// Screen export schemas use the same generation path as summaries.
const { timelineImageInputSchema } = await import(
  "../../../packages/schemas/src/timeline-image"
);
writeFileSync(
  new URL("timeline-image.json", dir),
  `${JSON.stringify(toJSONSchema(timelineImageInputSchema, { target: "draft-7", io: "input" }), null, 2)}\n`,
);

const { calendarImageInputSchema } = await import(
  "../../../packages/schemas/src/calendar-image"
);
writeFileSync(
  new URL("calendar-image.json", dir),
  `${JSON.stringify(toJSONSchema(calendarImageInputSchema, { target: "draft-7", io: "input" }), null, 2)}\n`,
);
