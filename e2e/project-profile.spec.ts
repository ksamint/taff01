import { type BrowserContext, expect, test } from "@playwright/test";
import {
  briefSchema,
  issuedWorkspaceInviteSchema,
  memberListSchema,
  meSchema,
  projectSchema,
  workspaceSchema,
} from "../packages/schemas/src/index";
import { freshAccount } from "./support/account";
import { verifyTestEmail } from "./support/email-verification";
import { messages, type TestLocale } from "./support/messages";
import { selectLocale } from "./support/preferences";
import { openProjectFilters } from "./support/task-fields";

// ADR 0021: an admin sets a project's stage and person in charge; the
// project header shows both in the reader's language.
test.use({ actionTimeout: 15000 });

test("an admin sets and changes a project's stage and person in charge", async ({
  page,
}, info) => {
  test.setTimeout(60000);
  const locale = info.project.name as TestLocale;
  const m = messages[locale];
  if (!process.env.DEMO_PASSWORD) throw new Error("DEMO_PASSWORD is required");
  await page.goto("/");
  await page
    .getByTestId("auth-email")
    .fill(process.env.DEMO_EMAIL ?? "alex@taff.local");
  await page.getByTestId("auth-continue").click();
  await page.getByTestId("auth-password").fill(process.env.DEMO_PASSWORD);
  await page.getByTestId("auth-submit").click();
  await expect(page.getByTestId("today-heading")).toBeVisible();
  await selectLocale(page, locale);
  const me = meSchema.parse(await (await page.request.get("/api/me")).json());
  const created = await page.request.post("/api/workspaces", {
    data: { name: `Stages ${locale} ${Date.now()}` },
  });
  expect(created.status()).toBe(201);
  const workspace = workspaceSchema.parse(await created.json());
  const self = memberListSchema
    .parse(
      await (
        await page.request.get(`/api/members?workspaceId=${workspace.id}`)
      ).json(),
    )
    .find((member) => member.userId === me.user.id);
  if (!self) throw new Error("The admin is not a member");
  await page.goto("/orgs");
  await page.getByTestId(`workspace-${workspace.id}`).click();

  await page.goto("/projects");
  await openProjectFilters(page);
  await page.getByTestId("new-project").click();
  await page.getByTestId("project-name").fill(`Retainer ${Date.now()}`);
  await page.getByTestId("project-stage-select").selectOption("lead");
  await page.getByTestId("project-lead-select").selectOption(self.id);
  const createdProject = page.waitForResponse(
    (response) =>
      response.request().method() === "POST" &&
      new URL(response.url()).pathname === "/api/projects",
  );
  await page.getByTestId("project-submit").click();
  const project = projectSchema.parse(await (await createdProject).json());
  expect(project).toMatchObject({ stage: "lead", leadId: self.id });
  await expect(page).toHaveURL(`/projects/${project.id}`);
  await expect(page.getByTestId("project-stage-control")).toHaveValue("lead");
  await expect(page.getByTestId("project-lead")).toHaveText(
    m.projects.leadIs.replace("{{name}}", self.name),
  );

  await openProjectFilters(page);
  await page.getByTestId("manage-project").click();
  await expect(page.getByTestId("project-stage-select")).toHaveValue("lead");
  await expect(page.getByTestId("project-lead-select")).toHaveValue(self.id);
  await page.getByTestId("project-stage-select").selectOption("in_service");
  const updated = page.waitForResponse(
    (response) =>
      response.request().method() === "PATCH" &&
      new URL(response.url()).pathname === `/api/projects/${project.id}`,
  );
  await page.getByTestId("project-submit").click();
  expect(projectSchema.parse(await (await updated).json())).toMatchObject({
    stage: "in_service",
    leadId: self.id,
    version: project.version + 1,
  });
  await expect(page.getByTestId("project-stage-control")).toHaveValue(
    "in_service",
  );
});

test("the person in charge moves the pipeline and Brief filters rows and totals", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(120000);
  const locale = info.project.name as TestLocale;
  const m = messages[locale];
  const admin = await freshAccount(page, locale);
  await verifyTestEmail(page, admin.user.id);
  const workspace = admin.workspaces[0]!;
  const contexts: BrowserContext[] = [];
  try {
    async function join(name: string) {
      const context = await browser.newContext({
        baseURL: process.env.AUTH_URL,
        viewport: page.viewportSize(),
        locale: locale === "en" ? "en-US" : locale,
      });
      contexts.push(context);
      const person = await context.newPage();
      const email = `pipeline-${crypto.randomUUID()}@example.test`;
      const response = await person.request.post("/api/auth/sign-up/email", {
        headers: { Origin: process.env.AUTH_URL! },
        data: { name, email, password: process.env.DEMO_PASSWORD },
      });
      expect(response.status()).toBe(200);
      const me = meSchema.parse(
        await (await person.request.get("/api/me")).json(),
      );
      await verifyTestEmail(person, me.user.id);
      const issued = await page.request.post(
        `/api/workspaces/${workspace.id}/invites`,
        { data: { email, role: "member" } },
      );
      expect(issued.status()).toBe(201);
      const invite = issuedWorkspaceInviteSchema.parse(await issued.json());
      expect(
        (
          await person.request.post("/api/workspace-invites/accept", {
            data: { token: invite.token },
          })
        ).status(),
      ).toBe(200);
      await person.goto("/");
      await selectLocale(person, locale);
      await person.goto("/orgs");
      await person.getByTestId(`workspace-${workspace.id}`).click();
      const member = memberListSchema
        .parse(
          await (
            await page.request.get(`/api/members?workspaceId=${workspace.id}`)
          ).json(),
        )
        .find((item) => item.userId === me.user.id)!;
      return { person, member };
    }
    const lead = await join(`Pipeline lead ${locale}`);
    const other = await join(`Pipeline colleague ${locale}`);
    const project = projectSchema.parse(
      await (
        await page.request.post(`/api/projects?workspaceId=${workspace.id}`, {
          data: { name: "Pipeline one", stage: "lead" },
        })
      ).json(),
    );
    const second = projectSchema.parse(
      await (
        await page.request.post(`/api/projects?workspaceId=${workspace.id}`, {
          data: { name: "Pipeline two", stage: "in_service" },
        })
      ).json(),
    );
    for (const [item, amount] of [
      [project, "1000.00"],
      [second, "2000.00"],
    ] as const) {
      expect(
        (
          await page.request.patch(`/api/projects/${item.id}`, {
            data: {
              version: item.version,
              contractAmount: amount,
              currency: "HKD",
            },
          })
        ).status(),
      ).toBe(200);
    }
    // Assign the person in charge through the existing admin dialog.
    await page.goto(`/projects/${project.id}`);
    await openProjectFilters(page);
    await page.getByTestId("manage-project").click();
    await page.getByTestId("project-lead-select").selectOption(lead.member.id);
    await page.getByTestId("project-submit").click();
    await expect(page.getByTestId("project-lead")).toContainText(
      lead.member.name,
    );
    await lead.person.goto(`/projects/${project.id}`);
    const control = lead.person.getByTestId("project-stage-control");
    await expect(control).toHaveValue("lead");
    // A rejected optimistic edit restores the previous stage.
    await lead.person.route(`**/api/projects/${project.id}`, async (route) => {
      if (route.request().method() === "PATCH")
        await route.fulfill({ status: 403, json: { error: "forbidden" } });
      else await route.continue();
    });
    await control.selectOption("closed");
    await expect(control).toHaveValue("lead");
    await lead.person.unroute(`**/api/projects/${project.id}`);
    await control.selectOption("proposal_sent");
    await expect(control).toBeEnabled();
    await expect(control).toHaveValue("proposal_sent");
    await lead.person
      .getByRole("button", { name: m.actions.undo, exact: true })
      .click();
    await expect(control).toHaveValue("lead");
    await expect(control).toBeEnabled();
    await control.selectOption("proposal_sent");
    await expect(control).toBeEnabled();
    await lead.person.reload();
    await expect(control).toHaveValue("proposal_sent");
    await other.person.goto(`/projects/${project.id}`);
    await expect(other.person.getByTestId("project-stage")).toContainText(
      m.projects.stages.proposal_sent,
    );
    await expect(other.person.getByTestId("project-stage-control")).toHaveCount(
      0,
    );
    const listed = (await (
      await other.person.request.get(
        `/api/projects?workspaceId=${workspace.id}`,
      )
    ).json()) as { id: string; version: number }[];
    const version = listed.find((item) => item.id === project.id)!.version;
    expect(
      (
        await other.person.request.patch(`/api/projects/${project.id}`, {
          data: { version, stage: "closed" },
        })
      ).status(),
    ).toBe(403);
    await lead.person.goto("/me");
    await lead.person.getByTestId("me-brief").click();
    const rows = lead.person.getByTestId("brief-risk");
    await expect(rows).toHaveCount(2);
    const row = rows.filter({ hasText: "Pipeline one" });
    await expect(row).toContainText(m.projects.stages.proposal_sent);
    await expect(row).toContainText(
      m.projects.leadIs.replace("{{name}}", lead.member.name),
    );
    const brief = briefSchema.parse(
      await (await lead.person.request.get("/api/brief?scope=all")).json(),
    );
    expect(
      brief.projects.find((item) => item.projectId === project.id),
    ).toMatchObject({ stage: "proposal_sent", leadId: lead.member.id });
    const totals = lead.person.getByTestId("brief-portfolio");
    const money = (amount: number) =>
      new Intl.NumberFormat(locale, {
        style: "currency",
        currency: "HKD",
        notation: "compact",
        maximumFractionDigits: 2,
      }).format(amount);
    await expect(totals).toContainText(money(3000));
    await lead.person.getByTestId("brief-stage-proposal_sent").click();
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText("Pipeline one");
    await expect(totals).toContainText(money(1000));
    await expect(
      lead.person.getByTestId("brief-stage-proposal_sent"),
    ).toHaveAttribute("aria-pressed", "true");
    await lead.person.getByTestId("brief-stage-in_service").click();
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText("Pipeline two");
    await expect(totals).toContainText(money(2000));
    await lead.person.getByTestId("brief-stage-all").click();
    await expect(rows).toHaveCount(2);
    await expect(totals).toContainText(money(3000));
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
