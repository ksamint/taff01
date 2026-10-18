import { expect, type Page, test } from "@playwright/test";
import {
  issuedWorkspaceInviteSchema,
  memberListSchema,
  meSchema,
  projectSchema,
  workspaceSchema,
} from "../packages/schemas/src/index";
import { timelineSchema } from "../packages/schemas/src/plan";
import { verifyTestEmail } from "./support/email-verification";
import type { TestLocale } from "./support/messages";
import { selectLocale } from "./support/preferences";

// ADR 0021: every person of the workspace reads contract amount and collected
// (finance:read); guests and agents see delivery % only. Only admins edit.
// A role change takes effect on an open page without a reload, including a
// change committed after the page's first reads but before its live
// connection opens: the server only closes sockets that are connected.
test.use({ actionTimeout: 15000 });

async function signIn(page: Page, locale: TestLocale) {
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
}

test("finance is hidden from a guest and follows a role change made before the live connection", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(90000);
  const locale = info.project.name as TestLocale;
  await signIn(page, locale);
  const created = await page.request.post("/api/workspaces", {
    data: { name: `Finance ${locale} ${Date.now()}` },
  });
  expect(created.status()).toBe(201);
  const workspace = workspaceSchema.parse(await created.json());
  const projectResponse = await page.request.post(
    `/api/projects?workspaceId=${workspace.id}`,
    { data: { name: `Contract ${locale}` } },
  );
  expect(projectResponse.status()).toBe(201);
  const project = projectSchema.parse(await projectResponse.json());
  const financed = await page.request.patch(`/api/projects/${project.id}`, {
    data: {
      version: project.version,
      contractAmount: "360000.00",
      currency: "HKD",
    },
  });
  expect(financed.status()).toBe(200);

  // A second, verified person joins as a guest.
  const context = await browser.newContext({
    baseURL: process.env.AUTH_URL,
    locale: locale === "en" ? "en-US" : locale,
    viewport: page.viewportSize(),
  });
  try {
    const member = await context.newPage();
    const email = `finance-${crypto.randomUUID()}@example.test`;
    const signedUp = await member.request.post("/api/auth/sign-up/email", {
      headers: { Origin: process.env.AUTH_URL! },
      data: {
        name: `Member ${locale}`,
        email,
        password: process.env.DEMO_PASSWORD,
      },
    });
    expect(signedUp.status()).toBe(200);
    const me = meSchema.parse(
      await (await member.request.get("/api/me")).json(),
    );
    await verifyTestEmail(member, me.user.id);
    const issued = await page.request.post(
      `/api/workspaces/${workspace.id}/invites`,
      { data: { email, role: "guest" } },
    );
    expect(issued.status()).toBe(201);
    const invite = issuedWorkspaceInviteSchema.parse(await issued.json());
    const accepted = await member.request.post(
      "/api/workspace-invites/accept",
      { data: { token: invite.token } },
    );
    expect(accepted.status()).toBe(200);
    const memberId = memberListSchema
      .parse(
        await (
          await page.request.get(`/api/members?workspaceId=${workspace.id}`)
        ).json(),
      )
      .find((item) => item.userId === me.user.id)?.id;
    if (!memberId) throw new Error("The member did not join");
    const setRole = async (role: "member" | "guest") => {
      const response = await page.request.patch(
        `/api/workspaces/${workspace.id}/members/${memberId}`,
        { data: { role } },
      );
      expect(response.status()).toBe(200);
    };

    // The API withholds the figures from the guest.
    const read = timelineSchema.parse(
      await (
        await member.request.get(`/api/projects/${project.id}/timeline`)
      ).json(),
    );
    expect(read.risk.finance).toBeNull();
    expect(read.risk.deliveryPercent).toEqual(expect.any(Number));

    // Hold the member's live connection until the role has changed.
    let connect!: () => void;
    const gate = new Promise<void>((resolve) => {
      connect = resolve;
    });
    await member.routeWebSocket(/\/api\/realtime/, async (socket) => {
      await gate;
      socket.connectToServer();
    });
    await member.goto("/");
    await expect(member.getByTestId("today-heading")).toBeVisible();
    await selectLocale(member, locale);
    await member.goto("/orgs");
    await member.getByTestId(`workspace-${workspace.id}`).click();
    await expect(
      member.getByTestId(`workspace-${workspace.id}`),
    ).toHaveAttribute("aria-pressed", "true");
    await member.goto(`/projects/${project.id}?view=timeline`);
    const view = member.getByTestId("timeline-view");
    await expect(view).toBeVisible();
    await expect(member.getByTestId("timeline-finance")).toHaveCount(0);

    // Promoted before the connection opens: the open page shows finance.
    await setRole("member");
    connect();
    await expect(member.getByTestId("timeline-finance")).toBeVisible();
    const asMember = timelineSchema.parse(
      await (
        await member.request.get(`/api/projects/${project.id}/timeline`)
      ).json(),
    );
    expect(asMember.risk.finance).toMatchObject({
      contractAmount: "360000.00",
      currency: "HKD",
    });
    // Members read the figures; recording a payment stays an admin act.
    const payment = await member.request.post(
      `/api/projects/${project.id}/payments`,
      { data: { amount: "1.00", paidOn: "2026-10-01" } },
    );
    expect(payment.status()).toBe(403);

    // Demoted over the live connection: the figures leave at once.
    await setRole("guest");
    await expect(member.getByTestId("timeline-view")).toBeVisible();
    await expect(member.getByTestId("timeline-finance")).toHaveCount(0);
  } finally {
    await context.close();
  }
});
