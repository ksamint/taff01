export const captureScreens = [
  "shell",
  "today",
  "projects",
  "task-detail",
  "review",
  "inbox",
  "calendar",
  "me",
  "type",
  "search",
  "notifications",
  "agent",
  "team",
  "mcp",
  "organizations",
  "quick-add",
  "companies",
  "company-detail",
  "contacts",
  "contact-detail",
  "stakeholders",
  "timeline",
  "relations",
  "brief",
  "mind",
  "home",
];

const projects = ["phone-en", "phone-zh-HK", "desktop-en", "desktop-zh-HK"];
const extraNames = {
  projects: ["projects-list"],
  review: ["review-deliverable"],
  calendar: ["calendar-week", "calendar-month"],
  type: ["type-dark"],
};

/** An empty selection preserves the full approved matrix. Selected runs are
 * explicit partial evidence and must still produce every expected PNG. */
export function resolveCaptureSelection(input = "") {
  const selected = input.trim();
  const screens = selected ? selected.split(/\s+/) : [...captureScreens];
  if (screens.some((screen) => !captureScreens.includes(screen)))
    throw new Error("Capture screens must be implemented v2 screen names");
  if (new Set(screens).size !== screens.length)
    throw new Error("Capture screens must not contain duplicates");
  const expectedPaths = screens
    .flatMap((screen) =>
      (screen === "home"
        ? [...projects, "phone-zh-CN", "desktop-zh-CN"]
        : projects
      ).flatMap((project) => {
        const names =
          screen === "shell"
            ? project.startsWith("phone")
              ? ["tabbar", "fab"]
              : ["sidebar"]
            : [screen, ...(extraNames[screen] ?? [])];
        return names.map(
          (name) => `e2e/__screenshots__/ui-v2.spec.ts/${project}/${name}.png`,
        );
      }),
    )
    .sort();
  if (!selected && expectedPaths.length !== 128)
    throw new Error("Full capture must contain all 128 native PNGs");
  return {
    mode: selected ? "selected" : "all",
    screens,
    expectedCases: screens.reduce(
      (count, screen) => count + (screen === "home" ? 6 : 4),
      0,
    ),
    expectedPngCount: expectedPaths.length,
    expectedPaths,
  };
}

export function assertCapturePaths(selection, paths) {
  const actual = [...paths].sort();
  if (JSON.stringify(actual) !== JSON.stringify(selection.expectedPaths))
    throw new Error(
      `Expected exactly ${selection.expectedPngCount} selected native PNG paths`,
    );
}
