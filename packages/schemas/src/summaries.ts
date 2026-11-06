// Shareholder daily summaries (ADR 0027). zod/mini with named imports, like
// every other shared schema, so the bundler drops what a route never uses.
import {
  array,
  boolean,
  extend,
  type infer as Infer,
  iso,
  literal,
  maxLength,
  minLength,
  nullable,
  number,
  object,
  optional,
  refine,
  regex,
  strictObject,
  string,
  trim,
  enum as zodEnum,
} from "zod/mini";
import {
  civilDateSchema,
  currencySchema,
  moneySchema,
  riskLevelSchema,
  riskReasonSchema,
} from "./plan";
import {
  boundedText,
  calendarInstantSchema,
  idSchema,
  localeSchema,
  nonnegativeInteger,
  positiveInteger,
  taskStatusSchema,
  timeZone,
  versionSchema,
} from "./primitives";
import { projectStageSchema } from "./project-read";

/** Who a tag addresses; v1 has one kind, extended by migration later. */
export const AUDIENCE_KINDS = ["shareholder"] as const;
export const audienceKindSchema = zodEnum(AUDIENCE_KINDS);
/** Wall-clock delivery time in the recipient's zone. */
export const deliverAtSchema = string().check(
  regex(/^([01][0-9]|2[0-3]):[0-5][0-9]$/),
);
export const summaryTimeZoneSchema = string().check(
  minLength(1),
  maxLength(64),
  refine(timeZone),
);
const optionalLabel = optional(string().check(trim(), maxLength(100)));
const hexHash = string().check(regex(/^[a-f0-9]{64}$/));
const hasChange = (body: Record<string, unknown>) =>
  Object.keys(body).some((key) => key !== "version");

export const audienceTagRefSchema = object({
  id: idSchema,
  kind: audienceKindSchema,
  org: string(),
  label: string(),
});
export const audienceTagSchema = extend(audienceTagRefSchema, {
  workspaceId: idSchema,
  archived: boolean(),
  version: versionSchema,
  projectCount: nonnegativeInteger,
  recipientCount: nonnegativeInteger,
  createdAt: iso.datetime(),
  updatedAt: iso.datetime(),
});
export const audienceTagListSchema = array(audienceTagSchema);
export const audienceTagInputSchema = strictObject({
  kind: optional(audienceKindSchema),
  org: boundedText(100),
  label: optionalLabel,
});
export const audienceTagUpdateSchema = strictObject({
  version: versionSchema,
  org: optional(boundedText(100)),
  label: optionalLabel,
  archived: optional(boolean()),
}).check(refine(hasChange));

export const audienceRecipientSchema = object({
  id: idSchema,
  workspaceId: idSchema,
  tagId: idSchema,
  name: string(),
  contactId: nullable(idSchema),
  userId: nullable(string()),
  locale: localeSchema,
  timeZone: string(),
  deliverAt: deliverAtSchema,
  includeFinance: boolean(),
  showPeople: boolean(),
  enabled: boolean(),
  nextDueAt: iso.datetime(),
  version: versionSchema,
  createdAt: iso.datetime(),
  updatedAt: iso.datetime(),
});
export const audienceRecipientListSchema = array(audienceRecipientSchema);
const recipientUserId = nullable(string().check(minLength(1), maxLength(200)));
export const audienceRecipientInputSchema = strictObject({
  name: boundedText(100),
  contactId: optional(nullable(idSchema)),
  userId: optional(recipientUserId),
  locale: localeSchema,
  timeZone: summaryTimeZoneSchema,
  deliverAt: deliverAtSchema,
  includeFinance: optional(boolean()),
  showPeople: optional(boolean()),
});
export const audienceRecipientUpdateSchema = strictObject({
  version: versionSchema,
  name: optional(boundedText(100)),
  contactId: optional(nullable(idSchema)),
  userId: optional(recipientUserId),
  locale: optional(localeSchema),
  timeZone: optional(summaryTimeZoneSchema),
  deliverAt: optional(deliverAtSchema),
  includeFinance: optional(boolean()),
  showPeople: optional(boolean()),
  enabled: optional(boolean()),
}).check(refine(hasChange));

/** PUT body: the complete tag set of one project. */
export const projectAudienceTagsInputSchema = strictObject({
  tagIds: array(idSchema).check(
    maxLength(20),
    refine((ids) => new Set(ids).size === ids.length),
  ),
});
export const projectAudienceTagsSchema = object({
  projectId: idSchema,
  tags: array(audienceTagRefSchema),
});

/** One task line. Names appear only when the recipient allows people. */
export const summaryTaskItemSchema = object({
  taskId: idSchema,
  number: positiveInteger,
  title: string(),
  status: taskStatusSchema,
  ownerName: nullable(string()),
  dueAt: nullable(iso.datetime()),
});
const items = array(summaryTaskItemSchema).check(maxLength(20));
export const summaryProjectSchema = object({
  projectId: idSchema,
  name: string(),
  stage: nullable(projectStageSchema),
  leadName: nullable(string()),
  dueAt: nullable(iso.datetime()),
  /** The project's recorded delivery progress, 0–100. */
  deliveryProgress: nonnegativeInteger,
  /** Exactly the timeline's risk (`buildPlanModel`), so both agree. */
  risk: object({
    level: riskLevelSchema,
    reasons: array(riskReasonSchema),
    plannedEnd: nullable(civilDateSchema),
    forecastEnd: nullable(civilDateSchema),
    slipDays: nonnegativeInteger,
    deliveryPercent: nonnegativeInteger,
  }),
  /** Null unless the recipient's `includeFinance` is on. */
  finance: nullable(
    object({
      currency: nullable(currencySchema),
      contractAmount: nullable(moneySchema),
      collectedAmount: moneySchema,
      collectedPercent: nullable(nonnegativeInteger),
    }),
  ),
  counts: object({
    total: nonnegativeInteger,
    open: nonnegativeInteger,
    done: nonnegativeInteger,
    inReview: nonnegativeInteger,
    blocked: nonnegativeInteger,
    dueToday: nonnegativeInteger,
    overdue: nonnegativeInteger,
    /** Done tasks whose last change fell on the local day. */
    completedToday: nonnegativeInteger,
    /** Open tasks changed on the local day. */
    movedToday: nonnegativeInteger,
  }),
  agentRuns: object({
    completedToday: nonnegativeInteger,
    pendingReview: nonnegativeInteger,
  }),
  completedToday: items,
  movedToday: items,
  dueToday: items,
  overdue: items,
  blocked: items,
});
export const dailySummarySnapshotSchema = object({
  version: literal(1),
  localDate: civilDateSchema,
  timeZone: string(),
  workspace: object({ name: string() }),
  tag: object({ kind: audienceKindSchema, org: string(), label: string() }),
  recipient: object({ name: string() }),
  projects: array(summaryProjectSchema).check(maxLength(100)),
  totals: object({
    projects: nonnegativeInteger,
    open: nonnegativeInteger,
    inReview: nonnegativeInteger,
    blocked: nonnegativeInteger,
    dueToday: nonnegativeInteger,
    overdue: nonnegativeInteger,
    completedToday: nonnegativeInteger,
    movedToday: nonnegativeInteger,
  }),
  /** True when a project list or any item list was capped. */
  truncated: boolean(),
});
/** Fixed at generation; a preview has no summary id. */
export const summaryWatermarkSchema = object({
  text: string(),
  recipientName: string(),
  org: string(),
  localDate: civilDateSchema,
  summaryId: nullable(idSchema),
  contentHash: hexHash,
});
export const dailySummarySchema = object({
  id: idSchema,
  workspaceId: idSchema,
  tagId: idSchema,
  recipientId: idSchema,
  localDate: civilDateSchema,
  timeZone: string(),
  locale: localeSchema,
  snapshot: dailySummarySnapshotSchema,
  watermark: summaryWatermarkSchema,
  contentHash: hexHash,
  createdAt: iso.datetime(),
});
export const dailySummaryListSchema = object({
  items: array(dailySummarySchema).check(maxLength(31)),
  truncated: boolean(),
});
export const dailySummaryListQuerySchema = strictObject({
  tagId: optional(idSchema),
  recipientId: optional(idSchema),
});
export const summaryPreviewInputSchema = strictObject({
  recipientId: idSchema,
  localDate: optional(civilDateSchema),
});
export const summaryPreviewSchema = object({
  recipientId: idSchema,
  localDate: civilDateSchema,
  timeZone: string(),
  locale: localeSchema,
  snapshot: dailySummarySnapshotSchema,
  watermark: summaryWatermarkSchema,
  contentHash: hexHash,
});

export const summaryShareStatusSchema = zodEnum([
  "active",
  "expired",
  "revoked",
]);
export const summaryShareSchema = object({
  id: idSchema,
  workspaceId: idSchema,
  summaryId: idSchema,
  createdBy: idSchema,
  status: summaryShareStatusSchema,
  expiresAt: iso.datetime(),
  revokedAt: nullable(iso.datetime()),
  viewCount: nonnegativeInteger,
  lastViewedAt: nullable(iso.datetime()),
  createdAt: iso.datetime(),
});
export const summaryShareListSchema = array(summaryShareSchema);
/** Returned once by create; lists never carry the token. */
export const issuedSummaryShareSchema = extend(summaryShareSchema, {
  token: string(),
});
export const summaryShareInputSchema = strictObject({
  expiresInDays: optional(
    number().check(refine((v) => Number.isInteger(v) && v >= 1 && v <= 90)),
  ),
});
export const summaryShareTokenSchema = string().check(
  regex(/^tsum_[A-Za-z0-9_-]{43}$/),
);
/**
 * Public read body. Any string up to 200 characters is accepted here so that
 * malformed, unknown, expired and revoked tokens all answer the same 404.
 */
export const sharedSummaryRequestSchema = strictObject({
  format: optional(zodEnum(["json", "txt", "png"])),
  token: string().check(minLength(1), maxLength(200)),
});
/** What a share link shows: the summary, never its internal ids. */
export const sharedSummarySchema = object({
  localDate: civilDateSchema,
  timeZone: string(),
  locale: localeSchema,
  snapshot: dailySummarySnapshotSchema,
  watermark: summaryWatermarkSchema,
  contentHash: hexHash,
  createdAt: iso.datetime(),
  expiresAt: iso.datetime(),
});

export const summaryJobSchema = strictObject({
  recipientId: idSchema,
  scheduledAt: calendarInstantSchema,
  version: versionSchema,
});
export const summaryJobCursorSchema = strictObject({
  scheduledAt: calendarInstantSchema,
  recipientId: idSchema,
});
export const dueSummaryJobsSchema = object({
  jobs: array(summaryJobSchema),
  nextCursor: nullable(summaryJobCursorSchema),
});
export const summaryJobResultSchema = object({
  status: zodEnum(["generated", "skipped"]),
  summaryId: nullable(idSchema),
});

export type AudienceKind = Infer<typeof audienceKindSchema>;
export type AudienceTagRef = Infer<typeof audienceTagRefSchema>;
export type AudienceTag = Infer<typeof audienceTagSchema>;
export type AudienceTagInput = Infer<typeof audienceTagInputSchema>;
export type AudienceTagUpdate = Infer<typeof audienceTagUpdateSchema>;
export type AudienceRecipient = Infer<typeof audienceRecipientSchema>;
export type AudienceRecipientInput = Infer<typeof audienceRecipientInputSchema>;
export type AudienceRecipientUpdate = Infer<
  typeof audienceRecipientUpdateSchema
>;
export type ProjectAudienceTagsInput = Infer<
  typeof projectAudienceTagsInputSchema
>;
export type ProjectAudienceTags = Infer<typeof projectAudienceTagsSchema>;
export type SummaryTaskItem = Infer<typeof summaryTaskItemSchema>;
export type SummaryProject = Infer<typeof summaryProjectSchema>;
export type DailySummarySnapshot = Infer<typeof dailySummarySnapshotSchema>;
export type SummaryWatermark = Infer<typeof summaryWatermarkSchema>;
export type DailySummary = Infer<typeof dailySummarySchema>;
export type DailySummaryList = Infer<typeof dailySummaryListSchema>;
export type DailySummaryListQuery = Infer<typeof dailySummaryListQuerySchema>;
export type SummaryPreviewInput = Infer<typeof summaryPreviewInputSchema>;
export type SummaryPreview = Infer<typeof summaryPreviewSchema>;
export type SummaryShare = Infer<typeof summaryShareSchema>;
export type IssuedSummaryShare = Infer<typeof issuedSummaryShareSchema>;
export type SummaryShareInput = Infer<typeof summaryShareInputSchema>;
export type SharedSummary = Infer<typeof sharedSummarySchema>;
export type SharedSummaryRequest = Infer<typeof sharedSummaryRequestSchema>;
export type SummaryJob = Infer<typeof summaryJobSchema>;
export type SummaryJobCursor = Infer<typeof summaryJobCursorSchema>;
export type DueSummaryJobs = Infer<typeof dueSummaryJobsSchema>;
export type SummaryJobResult = Infer<typeof summaryJobResultSchema>;

export const summaryRenderFormatSchema = zodEnum(["txt", "png"]);
export const summaryRenderSchema = object({
  id: idSchema,
  workspaceId: idSchema,
  summaryId: idSchema,
  format: summaryRenderFormatSchema,
  body: nullable(string()),
  data: nullable(string()),
  byteSize: positiveInteger,
  rendererVersion: string(),
  contentHash: hexHash,
  createdAt: iso.datetime(),
});
export const storeSummaryRenderInputSchema = strictObject({
  summaryId: idSchema,
  format: summaryRenderFormatSchema,
  body: optional(string().check(minLength(1), maxLength(4000))),
  data: optional(
    string().check(
      minLength(1),
      maxLength(546136),
      regex(/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/),
    ),
  ),
  rendererVersion: string().check(trim(), minLength(1), maxLength(100)),
}).check(
  refine((input) =>
    input.format === "txt"
      ? input.body !== undefined && input.data === undefined
      : input.data !== undefined && input.body === undefined,
  ),
);
export type SummaryRender = Infer<typeof summaryRenderSchema>;
export type SummaryRenderFormat = Infer<typeof summaryRenderFormatSchema>;
export type StoreSummaryRenderInput = Infer<
  typeof storeSummaryRenderInputSchema
>;
