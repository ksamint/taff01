import {
  aiSettingsInputSchema,
  aiSettingsSchema,
  askAnswerSchema,
  askInputSchema,
  audienceRecipientInputSchema,
  audienceRecipientListSchema,
  audienceRecipientSchema,
  audienceRecipientUpdateSchema,
  audienceTagInputSchema,
  audienceTagListSchema,
  audienceTagSchema,
  audienceTagUpdateSchema,
  briefSchema,
  dailySummaryListSchema,
  dailySummarySchema,
  dependencyInputSchema,
  dependencySchema,
  issuedSummaryShareSchema,
  milestoneInputSchema,
  milestoneListSchema,
  milestoneSchema,
  milestoneUpdateSchema,
  paymentInputSchema,
  paymentListSchema,
  paymentSchema,
  projectAudienceTagsInputSchema,
  projectAudienceTagsSchema,
  sharedSummaryRequestSchema,
  sharedSummarySchema,
  suggestionApplyResultSchema,
  suggestionDecisionSchema,
  suggestionInputSchema,
  suggestionListSchema,
  suggestionSchema,
  summaryPreviewInputSchema,
  summaryPreviewSchema,
  summaryShareInputSchema,
  summaryShareListSchema,
  summaryShareSchema,
  taskPlanInputSchema,
  taskPlanResultSchema,
  timelineSchema,
} from "@taff/schemas";
import { type $ZodType, toJSONSchema } from "zod/v4/core";
import { agentContracts } from "./rest-agent-contracts";
import { authContracts } from "./rest-auth-contracts";
import { crmMindContracts } from "./rest-crm-contracts";
import { workContracts } from "./rest-work-contracts";

export type RestContracts = Record<
  string,
  [
    input: $ZodType | null,
    status: number,
    output: $ZodType | null,
    media?: readonly string[],
  ]
>;

const timelineContracts = {
  "DELETE /api/dependencies/:id": [null, 200, dependencySchema],
  "DELETE /api/milestones/:id": [null, 200, milestoneSchema],
  "GET /api/projects/:id/milestones": [null, 200, milestoneListSchema],
  "GET /api/projects/:id/payments": [null, 200, paymentListSchema],
  "GET /api/projects/:id/timeline": [null, 200, timelineSchema],
  "PATCH /api/milestones/:id": [milestoneUpdateSchema, 200, milestoneSchema],
  "PATCH /api/tasks/:id/plan": [taskPlanInputSchema, 200, taskPlanResultSchema],
  "POST /api/dependencies": [dependencyInputSchema, 201, dependencySchema],
  "POST /api/projects/:id/milestones": [
    milestoneInputSchema,
    201,
    milestoneSchema,
  ],
  "POST /api/projects/:id/payments": [paymentInputSchema, 201, paymentSchema],
} satisfies RestContracts;

const assistantContracts = {
  "GET /api/brief": [null, 200, briefSchema],
  "GET /api/workspaces/:id/ai": [null, 200, aiSettingsSchema],
  "GET /api/workspaces/:id/suggestions": [null, 200, suggestionListSchema],
  "PATCH /api/workspaces/:id/ai": [
    aiSettingsInputSchema,
    200,
    aiSettingsSchema,
  ],
  "POST /api/ask": [askInputSchema, 200, askAnswerSchema],
  "POST /api/suggestions": [suggestionInputSchema, 201, suggestionSchema],
  "POST /api/suggestions/:id/apply": [
    suggestionDecisionSchema,
    200,
    suggestionApplyResultSchema,
  ],
  "POST /api/suggestions/:id/dismiss": [
    suggestionDecisionSchema,
    200,
    suggestionSchema,
  ],
  "POST /api/suggestions/:id/undo": [
    suggestionDecisionSchema,
    200,
    suggestionSchema,
  ],
} satisfies RestContracts;

const summaryAttachments = ["image/png", "text/plain"] as const;
const summaryContracts = {
  "DELETE /api/summary-shares/:id": [null, 200, summaryShareSchema],
  "GET /api/audience-tags/:id/recipients": [
    null,
    200,
    audienceRecipientListSchema,
  ],
  "GET /api/projects/:id/audience-tags": [null, 200, projectAudienceTagsSchema],
  "GET /api/summaries": [null, 200, dailySummaryListSchema],
  "GET /api/summaries/:id": [null, 200, dailySummarySchema],
  "GET /api/summaries/:id/render": [null, 200, null, summaryAttachments],
  "GET /api/summaries/:id/shares": [null, 200, summaryShareListSchema],
  "GET /api/workspaces/:id/audience-tags": [null, 200, audienceTagListSchema],
  "PATCH /api/audience-recipients/:id": [
    audienceRecipientUpdateSchema,
    200,
    audienceRecipientSchema,
  ],
  "PATCH /api/audience-tags/:id": [
    audienceTagUpdateSchema,
    200,
    audienceTagSchema,
  ],
  "POST /api/audience-tags/:id/recipients": [
    audienceRecipientInputSchema,
    201,
    audienceRecipientSchema,
  ],
  "POST /api/shared-summary": [
    sharedSummaryRequestSchema,
    200,
    sharedSummarySchema,
    summaryAttachments,
  ],
  "POST /api/summaries/:id/shares": [
    summaryShareInputSchema,
    201,
    issuedSummaryShareSchema,
  ],
  "POST /api/summaries/preview": [
    summaryPreviewInputSchema,
    200,
    summaryPreviewSchema,
  ],
  "POST /api/workspaces/:id/audience-tags": [
    audienceTagInputSchema,
    201,
    audienceTagSchema,
  ],
  "PUT /api/projects/:id/audience-tags": [
    projectAudienceTagsInputSchema,
    200,
    projectAudienceTagsSchema,
  ],
} satisfies RestContracts;

const contracts: RestContracts = {
  ...agentContracts,
  ...assistantContracts,
  ...authContracts,
  ...crmMindContracts,
  ...summaryContracts,
  ...timelineContracts,
  ...workContracts,
  "GET /api/workspaces/:id/view-image": [null, 200, null, ["image/png"]],
};

export function restJsonSchema() {
  return Object.fromEntries(
    Object.entries(contracts)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([route, [input, status, output, media]]) => [
        route,
        {
          requestBody: input
            ? toJSONSchema(input, { target: "draft-7", io: "input" })
            : null,
          responses: {
            [status]: {
              json: output
                ? toJSONSchema(output, { target: "draft-7", io: "output" })
                : null,
              ...(media && { otherMediaTypes: media }),
            },
          },
        },
      ]),
  );
}
