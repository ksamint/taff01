import { changeEventSchema } from "@taff/schemas";
import type { QueryClient } from "@tanstack/react-query";

const FAMILIES = [
  "tasks",
  "task",
  "runs",
  "run",
  "review",
  "inbox",
  "agent",
  "agent-tokens",
  "mcp-calls",
  "me",
  "members",
  "calendar",
  "task-calendar",
  "task-access",
  "task-comments",
  "projects",
  "search",
  "invites",
  "workspace-access",
];

export function connectWorkspace(
  client: QueryClient,
  workspaceId: string,
  userId: string,
) {
  let stopped = false;
  let socket: WebSocket | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let attempt = 0;
  let dirty = false;
  const flush = () => {
    if (stopped || !dirty || client.isMutating()) return;
    dirty = false;
    void client.invalidateQueries({
      predicate: ({ queryKey }) => FAMILIES.includes(String(queryKey[0])),
    });
  };
  const invalidate = () => {
    dirty = true;
    flush();
  };
  const unsubscribe = client.getMutationCache().subscribe(flush);
  function connect() {
    if (stopped) return;
    const url = new URL("/api/realtime", window.location.origin);
    url.protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
    url.searchParams.set("workspaceId", workspaceId);
    const current = new WebSocket(url);
    socket = current;
    current.onopen = () => {
      if (!stopped && current === socket) {
        attempt = 0;
        invalidate();
      }
    };
    current.onmessage = (message) => {
      if (
        stopped ||
        current !== socket ||
        typeof message.data !== "string" ||
        message.data.length > 8192
      )
        return;
      let body: unknown;
      try {
        body = JSON.parse(message.data);
      } catch {
        return;
      }
      const event = changeEventSchema.safeParse(body);
      if (
        event.success &&
        (event.data.workspaceId === workspaceId || event.data.userId === userId)
      )
        invalidate();
    };
    current.onerror = () => current.close();
    current.onclose = (event) => {
      if (stopped || current !== socket) return;
      // Auth revocation must be checked even while a write is pending.
      void client.invalidateQueries({ queryKey: ["me"] });
      invalidate();
      if (event.code === 1008) return;
      if (attempt < 8)
        timer = setTimeout(connect, Math.min(10_000, 250 * 2 ** attempt++));
    };
  }
  const reconnect = () => {
    if (
      stopped ||
      socket?.readyState === WebSocket.OPEN ||
      socket?.readyState === WebSocket.CONNECTING
    )
      return;
    clearTimeout(timer);
    attempt = 0;
    connect();
  };
  window.addEventListener("online", reconnect);
  window.addEventListener("focus", reconnect);
  connect();
  return () => {
    stopped = true;
    clearTimeout(timer);
    unsubscribe();
    window.removeEventListener("online", reconnect);
    window.removeEventListener("focus", reconnect);
    socket?.close();
  };
}
