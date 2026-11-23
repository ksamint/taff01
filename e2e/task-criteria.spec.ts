import { expect, test } from "@playwright/test";
import {
  meSchema,
  type TaskCriterion,
  taskSchema,
} from "../packages/schemas/src/index";
import { messages, type TestLocale } from "./support/messages";

test.use({ serviceWorkers: "block" });

test("editors arrange task criteria and reviewers can check them", async ({
  page,
}, info) => {
  const locale = info.project.name as TestLocale;
  const m = messages[locale];
  const signedUp = await page.request.post("/api/auth/sign-up/email", {
    headers: { Origin: process.env.AUTH_URL! },
    data: {
      name: "Criteria editor",
      email: `criteria-${crypto.randomUUID()}@example.test`,
      password: process.env.DEMO_PASSWORD,
    },
  });
  expect(signedUp.status()).toBe(200);
  const profile = await page.request.patch("/api/profile", {
    data: { locale, tz: "UTC" },
  });
  expect(profile.status()).toBe(200);
  const {
    workspaces: [workspace],
  } = meSchema.parse(await (await page.request.get("/api/me")).json());
  const created = await page.request.post("/api/tasks", {
    data: {
      workspaceId: workspace.id,
      ownerId: workspace.memberId,
      title: "Check the handoff",
    },
  });
  expect(created.status()).toBe(201);
  const task = taskSchema.parse(await created.json());
  const now = new Date().toISOString();
  let rows: TaskCriterion[] = [];
  let canReview = true;
  await page.route("**/api/task-criteria**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const segments = url.pathname.split("/");
    const [, , , id, action] = segments;
    if (request.method() === "GET") {
      expect(url.searchParams.get("taskId")).toBe(task.id);
      return route.fulfill({ json: rows });
    }
    if (id === "reorder") {
      const { ids, taskId } = request.postDataJSON() as {
        ids: string[];
        taskId: string;
      };
      expect(taskId).toBe(task.id);
      expect(ids).toEqual([rows[1].id, rows[0].id]);
      rows = ids.map((id, position) => ({
        ...rows.find((row) => row.id === id)!,
        position,
      }));
      return route.fulfill({ json: rows });
    }
    if (!id) {
      const { text, taskId } = request.postDataJSON() as {
        text: string;
        taskId: string;
      };
      expect(request.method()).toBe("POST");
      expect(taskId).toBe(task.id);
      const criterion = {
        id: crypto.randomUUID(),
        workspaceId: workspace.id,
        taskId,
        position: rows.length,
        text,
        checkedBy: null,
        checkedAt: null,
      };
      rows.push(criterion);
      return route.fulfill({ status: 201, json: criterion });
    }
    const criterion = rows.find((row) => row.id === id)!;
    if (request.method() === "PATCH") {
      expect(criterion.checkedAt).toBeNull();
      criterion.text = (request.postDataJSON() as { text: string }).text;
    } else {
      expect(request.method()).toBe("POST");
      expect(request.postData()).toBeNull();
      expect(["check", "uncheck"]).toContain(action);
      criterion.checkedAt = action === "check" ? now : null;
      criterion.checkedBy = action === "check" ? workspace.memberId : null;
    }
    return route.fulfill({ json: criterion });
  });
  const run = {
    id: crypto.randomUUID(),
    workspaceId: workspace.id,
    taskId: task.id,
    agentId: crypto.randomUUID(),
    status: "needs_review",
    version: 1,
    summary: "",
    startedAt: now,
    updatedAt: now,
    finishedAt: null,
    durationMs: 0,
    costMicros: 0,
  };
  await page.route(`**/api/tasks/${task.id}/review`, (route) =>
    route.fulfill({
      json: {
        task,
        run,
        events: [],
        artifacts: [],
        comments: [],
        canReview,
        canControl: false,
        canSubmit: false,
        checks: {
          matchesDescription: false,
          verifiable: false,
          withinPermissions: false,
        },
      },
    }),
  );

  const detail = `/tasks/${task.id}`;
  const criteria = page.getByRole("region", { name: m.taskCriteria.title });
  await page.goto(detail);
  await expect(page.getByTestId("task-detail-heading")).toHaveText(task.title);
  await expect(criteria.getByText(m.taskCriteria.empty)).toBeVisible();
  async function save(button: string, value: string) {
    const sheet = page.getByRole("dialog", { name: button });
    await sheet.getByLabel(m.taskCriteria.text).fill(value);
    await sheet.getByRole("button", { name: m.taskCriteria.save }).click();
    await expect(sheet).toBeHidden();
  }
  const first = "Confirm references";
  const second = "Verify the totals";
  for (const text of [first, "Check the math"]) {
    await criteria.getByRole("button", { name: m.taskCriteria.add }).click();
    await save(m.taskCriteria.add, text);
  }
  const secondRow = criteria
    .getByRole("listitem")
    .filter({ hasText: "Check the math" });
  await secondRow.getByRole("button", { name: m.taskCriteria.edit }).click();
  await save(m.taskCriteria.edit, second);
  const reordered = criteria.getByRole("listitem").filter({ hasText: second });
  await reordered.getByRole("button", { name: m.taskCriteria.moveUp }).click();
  await expect(criteria.getByRole("listitem").first()).toContainText(second);

  await page.goto(`${detail}/review`);
  const reviewed = criteria.getByRole("checkbox", { name: second });
  await expect(
    page.getByTestId("review-check-matchesDescription"),
  ).toBeVisible();
  await reviewed.click();
  await expect(reviewed).toBeChecked();
  await reviewed.click();
  await expect(reviewed).not.toBeChecked();
  await reviewed.click();
  await expect(reviewed).toBeChecked();
  canReview = false;
  await page.reload();
  await expect(reviewed).toBeDisabled();
  await expect(reviewed).toBeChecked();

  await page.goto(detail);
  await expect(
    reordered.getByRole("button", { name: m.taskCriteria.edit }),
  ).toBeDisabled();
  await expect(
    criteria.getByRole("checkbox", { name: first }),
  ).not.toBeChecked();
});
