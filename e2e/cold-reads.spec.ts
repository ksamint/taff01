import { expect, test } from "@playwright/test";
import { projectSchema } from "../packages/schemas/src/index";
import { freshAccount, type TestLocale } from "./support/account";

test("cold routes read workspace data once and recheck roles on first socket open", async ({
  page,
  browser,
}, info) => {
  const me = await freshAccount(page, info.project.name as TestLocale);
  const workspace = me.workspaces[0];
  const result = await page.request.post(
    `/api/projects?workspaceId=${workspace.id}`,
    { data: { name: "Cold-read board" } },
  );
  expect(result.status()).toBe(201);
  const project = projectSchema.parse(await result.json());
  for (let index = 1; index <= 12; index++) {
    const response = await page.request.post("/api/tasks", {
      data: {
        workspaceId: workspace.id,
        projectId: project.id,
        ownerId: workspace.memberId,
        title: `Cold-read card ${index}`,
      },
    });
    expect(response.status()).toBe(201);
  }
  // Use the signed-in browser's saved preferences with a cold HTTP cache.
  const storageState = await page.context().storageState();
  for (const [path, ready] of [
    ["/", "today-heading"],
    [`/projects/${project.id}`, "project-filters"],
    ["/orgs", `workspace-${workspace.id}`],
  ]) {
    const context = await browser.newContext({
      baseURL: process.env.AUTH_URL,
      storageState,
      viewport: page.viewportSize(),
      serviceWorkers: "block",
    });
    try {
      const cold = await context.newPage();
      // Keep the actual handshake and role check. Ignore unrelated job events.
      await cold.routeWebSocket("**/api/realtime?*", (socket) => {
        const server = socket.connectToServer();
        server.onMessage(() => {});
      });
      const reads = new Map<string, number>();
      cold.on("request", (request) => {
        const { pathname, search } = new URL(request.url());
        if (request.method() !== "GET" || !pathname.startsWith("/api/")) return;
        const key = pathname + search;
        reads.set(key, (reads.get(key) ?? 0) + 1);
      });
      await cold.goto(path);
      await expect(cold.getByTestId(ready)).toBeVisible();
      if (path.startsWith("/projects/")) {
        await expect(cold.getByTestId("board-task")).toHaveCount(12);
      }
      await expect.poll(() => reads.get("/api/me")).toBe(2);
      await cold.waitForLoadState("networkidle");
      const dataReads = [...reads].filter(([url]) => url !== "/api/me");
      expect(
        dataReads.filter(([, count]) => count > 1),
        path,
      ).toEqual([]);
      if (path === "/") {
        expect(dataReads.length).toBeLessThanOrEqual(6);
      } else {
        expect(dataReads.length + 2).toBeLessThanOrEqual(10);
      }
    } finally {
      await context.close();
    }
  }
});
