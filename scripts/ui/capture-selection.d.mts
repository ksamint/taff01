export const captureScreens: string[];
export type CaptureSelection = {
  mode: "selected" | "all";
  screens: string[];
  expectedCases: number;
  expectedPngCount: number;
  expectedPaths: string[];
};
export function resolveCaptureSelection(input?: string): CaptureSelection;
export function assertCapturePaths(
  selection: CaptureSelection,
  paths: readonly string[],
): void;
