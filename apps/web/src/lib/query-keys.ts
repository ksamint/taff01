export const tasksKey = (workspaceId: string) =>
  ["tasks", workspaceId] as const;
export const membersKey = (workspaceId: string) =>
  ["members", workspaceId] as const;
export const runsKey = (workspaceId: string) => ["runs", workspaceId] as const;
export const calendarKey = (workspaceId: string, from: string, to: string) =>
  ["calendar", workspaceId, from, to] as const;
export const inboxKey = (workspaceId: string) =>
  ["inbox", workspaceId] as const;

export const projectsKey = (workspaceId: string) =>
  ["projects", workspaceId] as const;
