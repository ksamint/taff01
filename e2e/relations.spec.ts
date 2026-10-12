import { expect, test } from "@playwright/test";
import type { WorkspaceGraph } from "../packages/schemas/src/graph-read";
import { freshAccount, messages, type TestLocale } from "./support/account";

function fixture(workspaceId: string): WorkspaceGraph {
  const task = crypto.randomUUID();
  const project = crypto.randomUUID();
  const person = crypto.randomUUID();
  const agent = crypto.randomUUID();
  return {
    workspaceId,
    status: "ready",
    syncedAt: "2026-10-10T12:00:00.000Z",
    nodeLimit: 500,
    nodes: [
      { id: task, kind: "task", label: "Launch task", status: "todo" },
      { id: project, kind: "project", label: "Launch project" },
      { id: person, kind: "person", label: "Project owner" },
      { id: agent, kind: "agent", label: "Research agent" },
    ],
    edges: [
      { source: task, target: project, kind: "project" },
      { source: task, target: person, kind: "owner" },
      { source: task, target: agent, kind: "worker" },
    ],
  };
}

test("relationships expose the graph, full text, focus, and live recovery in each locale", async ({
  page,
}, info) => {
  const locale = info.project.name as TestLocale;
  const m = messages[locale];
  const me = await freshAccount(page, locale);
  const graph = fixture(me.workspaces[0]!.id);
  let state: WorkspaceGraph["status"] = "stale";
  let requests = 0;
  let forbidden = false;
  await page.route("**/api/graph?*", (route) => {
    requests++;
    if (forbidden)
      return route.fulfill({ status: 403, json: { error: "forbidden" } });
    return route.fulfill({
      json: {
        ...graph,
        status: state,
        nodes: state === "ready" ? graph.nodes : [],
        edges: state === "ready" ? graph.edges : [],
      },
    });
  });
  await page.goto("/me");
  await page.getByTestId("me-advanced").click();
  await page
    .getByRole("link", { name: m.relations.title, exact: true })
    .click();
  await expect(page).toHaveURL(/\/relations$/);
  await expect(
    page.getByRole("heading", { name: m.relations.title }),
  ).toBeVisible();
  await expect(page.getByRole("status").first()).toHaveText(
    m.relations.state.stale,
  );
  await expect(page.locator(".relations-svg")).toHaveCount(0);
  state = "ready";
  await expect(page.locator(".relations-svg")).toBeVisible({ timeout: 10_000 });
  expect(requests).toBeGreaterThan(1);
  await expect(page.locator(".relations-list li")).toHaveCount(3);
  await expect(page.locator(".relations-list")).toContainText(
    m.relations.edge.project,
  );
  await expect(page.locator(".relations-list")).toContainText(
    m.relations.edge.owner,
  );
  await expect(page.locator(".relations-list")).toContainText(
    m.relations.edge.worker,
  );
  await expect(
    page
      .locator(".relations-list")
      .getByRole("link", { name: "Launch project" }),
  ).toHaveAttribute("href", `/projects/${graph.nodes[1]!.id}`);
  await expect(
    page
      .locator(".relations-list")
      .getByRole("link", { name: "Research agent" }),
  ).toHaveAttribute("href", `/agents/${graph.nodes[3]!.id}`);
  await page.getByLabel(m.relations.search).fill("Research");
  await page
    .getByLabel(m.relations.select, { exact: true })
    .selectOption(graph.nodes[3]!.id);
  await expect(page.locator(".relations-focus")).toHaveText(
    `${m.relations.kind.agent}Research agent`,
  );
  await expect(page.locator(".relations-list li")).toHaveCount(1);
  const focus = page.getByRole("button", {
    name: m.relations.focusNode.replace("{{name}}", "Launch task"),
    exact: true,
  });
  for (let step = 0; step < 40; step++) {
    if (await focus.evaluate((element) => element === document.activeElement))
      break;
    await page.keyboard.press("Tab");
  }
  await expect(focus).toBeFocused();
  expect((await focus.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.keyboard.press("Enter");
  await expect(page.locator(".relations-focus")).toContainText("Launch task");
  await page.getByLabel(m.relations.search).fill("");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  expect(
    await page
      .locator(".relations-node-kind")
      .evaluateAll((nodes) =>
        Math.min(
          ...nodes.map((node) =>
            Number.parseFloat(getComputedStyle(node).fontSize),
          ),
        ),
      ),
  ).toBeGreaterThanOrEqual(12);
  await page.screenshot({
    path: info.outputPath(`relations-${locale}.png`),
    fullPage: true,
  });
  await info.attach("relationships", {
    path: info.outputPath(`relations-${locale}.png`),
    contentType: "image/png",
  });
  for (const status of ["unavailable", "disabled", "too_large"] as const) {
    state = status;
    await page
      .getByRole("button", { name: m.relations.refresh, exact: true })
      .click();
    await expect(page.getByRole("status").first()).toContainText(
      m.relations.state[status],
    );
    await expect(page.locator(".relations-svg")).toHaveCount(0);
  }
  state = "ready";
  await page
    .getByRole("button", { name: m.relations.refresh, exact: true })
    .click();
  await expect(page.locator(".relations-svg")).toBeVisible();
  forbidden = true;
  await page
    .getByRole("button", { name: m.relations.refresh, exact: true })
    .click();
  await expect(page.getByRole("status").first()).toContainText(
    m.errors.forbidden,
  );
  await expect(page.locator(".relations-svg")).toHaveCount(0);
});

test("a 500-node workspace uses bounded pages without losing connections", async ({
  page,
}, info) => {
  const locale = info.project.name as TestLocale;
  const m = messages[locale];
  const me = await freshAccount(page, locale);
  const graph = fixture(me.workspaces[0]!.id);
  for (let i = graph.nodes.length; i < 500; i++) {
    const id = crypto.randomUUID();
    graph.nodes.push({ id, kind: "task", label: `Related task ${i}` });
    graph.edges.push({
      source: id,
      target: graph.nodes[0]!.id,
      kind: "parent",
    });
  }
  await page.route("**/api/graph?*", (route) => route.fulfill({ json: graph }));
  await page.goto("/relations");
  await expect(page.locator(".relations-list li")).toHaveCount(8);
  await expect(page.locator(".relations-svg .relations-node")).toHaveCount(9);
  await page
    .getByRole("button", { name: m.relations.next, exact: true })
    .click();
  await expect(page.locator(".relations-list")).toContainText("Related task 9");
  await page.getByLabel(m.relations.search).fill("Related task 499");
  await page
    .getByLabel(m.relations.select, { exact: true })
    .selectOption(graph.nodes[499]!.id);
  await expect(page.locator(".relations-list li")).toHaveCount(1);
  await expect(page.locator(".relations-list")).toContainText("Launch task");
  await expect(
    page.getByRole("button", { name: m.relations.previous, exact: true }),
  ).toBeDisabled();
});
