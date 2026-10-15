export function validateLiveArgs(args: string[]): string[];
export function freshLiveReport(parent: string): string;
export function ownsGrant(
  grant: { id: string; taskId?: string | null; status: string },
  baseline: readonly { id: string }[],
  entries: readonly { kind: string; id: string }[],
): boolean;
export function failureCategory(error: unknown): string;
