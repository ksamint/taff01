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

test("project deadline and delivery progress preserve time, export and reject stale edits", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const locale = info.project.name as TestLocale;
  const me = await freshAccount(page, locale);
  const workspace = me.workspaces[0];
  const zone = "Pacific/Honolulu";
  expect(
    (
      await page.request.patch("/api/profile", { data: { locale, tz: zone } })
    ).status(),
  ).toBe(200);
  const originalDue = "2030-06-08T01:23:45.123Z";
  let project = projectSchema.parse(
    await (
      await page.request.post(`/api/projects?workspaceId=${workspace.id}`, {
        data: {
          name: "Delivery fields",
          dueAt: originalDue,
          deliveryProgress: 12,
        },
      })
    ).json(),
  );
  const path = `/api/projects/${project.id}`;
  async function open() {
    await openProjectFilters(page);
    await page.getByTestId("manage-project").click();
    await expect(page.getByTestId("project-due-date")).toBeVisible();
  }
  async function save() {
    const response = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === path && r.request().method() === "PATCH",
    );
    await page.getByTestId("project-submit").click();
    const result = await response;
    expect(result.status()).toBe(200);
    await expect(page.getByTestId("project-submit")).toHaveCount(0);
    return projectSchema.parse(await result.json());
  }
  async function exportedHash(phase: "before" | "after") {
    const result = await page.request.get(
      `/api/workspaces/${workspace.id}/view-image?locale=${locale}&projectId=${project.id}`,
    );
    expect(result.status()).toBe(200);
    expect(result.headers()["content-type"]).toContain("image/png");
    const png = await result.body();
    expect(png.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
    expect(png.readUInt32BE(16)).toBe(1080);
    expect(png.byteLength).toBeLessThanOrEqual(400 * 1024);
    await info.attach(`${phase}-project-export`, {
      body: png,
      contentType: "image/png",
    });
    const hash = result.headers()["x-taff-content-hash"];
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    return hash;
  }
  await page.goto(`/projects/${project.id}`);
  const beforeHash = await exportedHash("before");
  await open();
  await expect(page.getByTestId("project-due-date")).toHaveValue("2030-06-07");
  const progress = page.getByTestId("project-delivery-progress");
  for (const invalid of ["", "-1", "101", "1.5"]) {
    await progress.fill(invalid);
    await page.getByTestId("project-submit").click();
    expect(
      await progress.evaluate((input: HTMLInputElement) =>
        input.checkValidity(),
      ),
    ).toBe(false);
    await expect(page.getByTestId("project-submit")).toBeVisible();
  }
  await progress.fill("45");
  project = await save();
  expect(project.dueAt).toBe(originalDue);
  expect(project.deliveryProgress).toBe(45);
  await open();
  await page.getByTestId("project-due-date").fill("2030-06-09");
  await progress.fill("100");
  project = await save();
  expect(project.dueAt).toBe("2030-06-10T09:59:59.999Z");
  expect(project.deliveryProgress).toBe(100);
  const due = page.getByTestId("project-due");
  await expect(due).toContainText(messages[locale].projects.dueDate);
  await expect(due).toContainText(
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeZone: zone,
    }).format(new Date(project.dueAt!)),
  );
  await expect(page.getByTestId("project-progress")).toContainText(
    messages[locale].projects.deliveryProgress,
  );
  await expect(page.getByTestId("project-progress")).toContainText(
    new Intl.NumberFormat(locale, { style: "percent" }).format(1),
  );
  expect(await exportedHash("after")).not.toBe(beforeHash);
  await page.reload();
  await open();
  await expect(page.getByTestId("project-due-date")).toHaveValue("2030-06-09");
  await expect(progress).toHaveValue("100");

  // Keep the dialog's captured version while another writer advances the project.
  const otherWrite = await page.request.patch(path, {
    data: { version: project.version, deliveryProgress: 80 },
  });
  expect(otherWrite.status()).toBe(200);
  await progress.fill("90");
  const stale = page.waitForResponse(
    (r) =>
      new URL(r.url()).pathname === path && r.request().method() === "PATCH",
  );
  await page.getByTestId("project-submit").click();
  expect((await stale).status()).toBe(409);
  await expect(page.getByTestId("toast")).toContainText(
    messages[locale].errors.conflict,
  );
  await expect(page.getByTestId("project-submit")).toBeVisible();
  await expect(page.getByTestId("project-progress")).toContainText(
    new Intl.NumberFormat(locale, { style: "percent" }).format(0.8),
  );
  await page.keyboard.press("Escape");
  await open();
  await page.getByTestId("project-due-date").fill("");
  await progress.fill("0");
  project = await save();
  expect(project.dueAt).toBeNull();
  expect(project.deliveryProgress).toBe(0);
  await expect(page.getByTestId("project-due")).toHaveCount(0);
  await expect(page.getByTestId("project-progress")).toContainText(
    new Intl.NumberFormat(locale, { style: "percent" }).format(0),
  );
});

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
          data: {
            name: "Pipeline one",
            stage: "lead",
            dueAt: "2030-06-08T01:23:45.123Z",
            deliveryProgress: 64,
          },
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
    for (const reader of [lead.person, other.person]) {
      await expect(reader.getByTestId("project-due")).toContainText(
        messages[locale].projects.dueDate,
      );
      await expect(reader.getByTestId("project-progress")).toContainText("64");
      await openProjectFilters(reader);
      await expect(reader.getByTestId("manage-project")).toHaveCount(0);
      await reader.keyboard.press("Escape");
      expect(
        (
          await reader.request.patch(`/api/projects/${project.id}`, {
            data: {
              version: project.version,
              dueAt: null,
              deliveryProgress: 0,
            },
          })
        ).status(),
      ).toBe(403);
    }
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

    // Retain a saved lead after demotion without offering guests as new picks.
    expect(
      (
        await page.request.patch(
          `/api/workspaces/${workspace.id}/members/${lead.member.id}`,
          {
            data: { role: "guest" },
          },
        )
      ).status(),
    ).toBe(200);
    await page.reload();
    await openProjectFilters(page);
    await page.getByTestId("manage-project").click();
    const picker = page.getByTestId("project-lead-select");
    await expect(picker).toHaveValue(lead.member.id);
    const savedGuest = picker.locator(`option[value="${lead.member.id}"]`);
    await expect(savedGuest).toHaveText(
      m.projects.leadGuest.replace("{{name}}", lead.member.name),
    );
    await expect(savedGuest).toBeDisabled();
    await page.getByTestId("project-name").fill("Renamed pipeline");
    const renamedResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "PATCH" &&
        new URL(response.url()).pathname === `/api/projects/${project.id}`,
    );
    await page.getByTestId("project-submit").click();
    expect(
      projectSchema.parse(await (await renamedResponse).json()),
    ).toMatchObject({ name: "Renamed pipeline", leadId: lead.member.id });
    await openProjectFilters(page);
    await page.getByTestId("manage-project").click();
    const archivedResponse = page.waitForResponse(
      (response) =>
        response.request().method() === "PATCH" &&
        new URL(response.url()).pathname === `/api/projects/${project.id}`,
    );
    await page
      .getByRole("button", { name: m.projects.archive, exact: true })
      .click();
    expect(
      projectSchema.parse(await (await archivedResponse).json()),
    ).toMatchObject({ archived: true, leadId: lead.member.id });
    await openProjectFilters(page);
    await page.getByTestId("new-project").click();
    await expect(
      page
        .getByTestId("project-lead-select")
        .locator(`option[value="${lead.member.id}"]`),
    ).toHaveCount(0);
    // Losing admin authority removes an editor that was already open.
    expect(
      (
        await page.request.patch(
          `/api/workspaces/${workspace.id}/members/${other.member.id}`,
          {
            data: { role: "admin" },
          },
        )
      ).status(),
    ).toBe(200);
    expect(
      (
        await other.person.request.patch(
          `/api/workspaces/${workspace.id}/members/${workspace.memberId}`,
          {
            data: { role: "member" },
          },
        )
      ).status(),
    ).toBe(200);
    await expect(page.getByTestId("project-submit")).toHaveCount(0);
  } finally {
    await Promise.all(contexts.map((context) => context.close()));
  }
});
