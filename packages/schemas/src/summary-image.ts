import {
  iso,
  maxLength,
  minLength,
  regex,
  strictObject,
  string,
} from "zod/mini";
import { localeSchema } from "./primitives";
import {
  dailySummarySnapshotSchema,
  summaryWatermarkSchema,
} from "./summaries";

/** Internal, stateless renderer contract emitted as JSON Schema for Rust. */
export const summaryImageInputSchema = strictObject({
  snapshot: dailySummarySnapshotSchema,
  watermark: summaryWatermarkSchema,
  contentHash: string().check(regex(/^[a-f0-9]{64}$/)),
  createdAt: iso.datetime(),
  locale: localeSchema,
  text: string().check(minLength(1), maxLength(4000)),
  formattedCreatedAt: string().check(minLength(1), maxLength(200)),
});
