// Brief, Ask taff and agent suggestions (M17). Keys start with the realtime
// families "brief" and "suggestions", so any plan, run, grant or proposal
// change refreshes them. Only the lazy brief chunk imports this file.
import {
  type AskAnswer,
  askAnswerSchema,
  type Brief,
  briefSchema,
  type Suggestion,
  suggestionApplyResultSchema,
  suggestionListSchema,
  suggestionSchema,
} from "@taff/schemas/assistant";
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { request } from "./api";
import { currentSession } from "./session-cache";

/** Every membership: the brief reads "across all projects". */
export const briefKey = ["brief", "all"] as const;
export const suggestionsKey = (workspaceId: string) =>
  ["suggestions", workspaceId, { status: "pending" }] as const;
/** Families an applied or dismissed proposal can change. */
const FAMILIES = [
  "brief",
  "suggestions",
  "tasks",
  "task",
  "timeline",
  "calendar",
  "task-calendar",
  "graph",
];

export function useBrief(enabled = true) {
  const client = useQueryClient();
  return useQuery<Brief>({
    queryKey: briefKey,
    enabled: enabled && currentSession(client)?.confirmed !== false,
    retry: false,
    queryFn: async () =>
      briefSchema.parse(await request("/api/brief?scope=all")),
  });
}

/** Pending proposals of the workspaces the brief's actions mention. */
export function usePendingSuggestions(workspaceIds: string[]) {
  const client = useQueryClient();
  const enabled = currentSession(client)?.confirmed !== false;
  return useQueries({
    queries: workspaceIds.map((workspaceId) => ({
      queryKey: suggestionsKey(workspaceId),
      enabled,
      retry: false,
      queryFn: async () =>
        suggestionListSchema.parse(
          await request(
            `/api/workspaces/${workspaceId}/suggestions?status=pending`,
          ),
        ),
    })),
    combine: (results) =>
      new Map<string, Suggestion>(
        results.flatMap((result) =>
          (result.data ?? []).map((item) => [item.id, item] as const),
        ),
      ),
  });
}

/** POST /api/ask: the rules answer (the model only when opted in, D6). */
export function useAsk() {
  return useMutation<AskAnswer, Error, string>({
    mutationKey: ["ask"],
    mutationFn: async (question) =>
      askAnswerSchema.parse(
        await request("/api/ask", {
          method: "POST",
          body: JSON.stringify({ question }),
        }),
      ),
  });
}

/**
 * A person applies or dismisses an agent's proposal with its version. The
 * server runs the operation or its versioned inverse in one transaction.
 */
export function useDecideSuggestion() {
  const client = useQueryClient();
  return useMutation({
    mutationKey: ["suggestion-decision"],
    mutationFn: async ({
      suggestion,
      decision,
    }: {
      suggestion: Suggestion;
      decision: "apply" | "dismiss" | "undo";
    }) => {
      const body = await request(
        `/api/suggestions/${suggestion.id}/${decision}`,
        {
          method: "POST",
          body: JSON.stringify({ version: suggestion.version }),
        },
      );
      return decision === "apply"
        ? suggestionApplyResultSchema.parse(body).suggestion
        : suggestionSchema.parse(body);
    },
    onSettled: () =>
      client.invalidateQueries({
        predicate: ({ queryKey }) => FAMILIES.includes(String(queryKey[0])),
      }),
  });
}
