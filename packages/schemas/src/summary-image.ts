import {
  type infer as Infer,
  iso,
  maxLength,
  minLength,
  regex,
  strictObject,
  string,
  union,
} from "zod/mini";
import { localeSchema } from "./primitives";
import {
  dailySummarySnapshotSchema,
  summaryWatermarkSchema,
} from "./summaries";
import { summaryLayoutSchema } from "./summary-layout";

const contentHash = string().check(regex(/^[a-f0-9]{64}$/));

/** image-2: the designed layout (ADR 0029 amendment 1). */
export const summaryImageLayoutInputSchema = strictObject({
  layout: summaryLayoutSchema,
  watermark: summaryWatermarkSchema,
  contentHash,
});
/** image-1: the rasterized text input, accepted for one release (DS-8.7). */
export const summaryImageTextInputSchema = strictObject({
  snapshot: dailySummarySnapshotSchema,
  watermark: summaryWatermarkSchema,
  contentHash,
  createdAt: iso.datetime(),
  locale: localeSchema,
  text: string().check(minLength(1), maxLength(4000)),
  formattedCreatedAt: string().check(minLength(1), maxLength(200)),
});
/** Internal, stateless renderer contract emitted as JSON Schema for Rust. */
export const summaryImageInputSchema = union([
  summaryImageLayoutInputSchema,
  summaryImageTextInputSchema,
]);
export type SummaryImageLayoutInput = Infer<
  typeof summaryImageLayoutInputSchema
>;
