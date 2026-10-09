import { type Browser, expect, type Page } from "@playwright/test";
import {
  issuedWorkspaceInviteSchema,
  type Me,
  memberListSchema,
  meSchema,
  workspaceSchema,
} from "../../packages/schemas/src/index";

/** Genuine profile copy and invitation acceptance; no invented agent identity. */
export async function agentWorkspace(
  page: Page,
  browser: Browser,
  recipient: Me,
) {
  const admin = await browser.newContext({ baseURL: process.env.AUTH_URL });
  try {
    expect(
      (
        await admin.request.post("/api/auth/sign-in/email", {
          data: {
            email: process.env.DEMO_EMAIL ?? "alex@taff.local",
            password: process.env.DEMO_PASSWORD,
          },
        })
      ).status(),
    ).toBe(200);
    const me = meSchema.parse(
      await (await admin.request.get("/api/me")).json(),
    );
    let sourceId: string | undefined;
    for (const workspace of me.workspaces.filter(
      (item) => item.role === "admin",
    )) {
      const members = memberListSchema.parse(
        await (
          await admin.request.get(`/api/members?workspaceId=${workspace.id}`)
        ).json(),
      );
      sourceId = members.find((member) => member.kind === "agent")?.id;
      if (sourceId) break;
    }
    if (!sourceId) throw new Error("Seeded agent profile is required");
    const workspace = workspaceSchema.parse(
      await (
        await admin.request.post("/api/workspaces", {
          data: {
            name: `M7 agent ${crypto.randomUUID()}`,
            agentIds: [sourceId],
          },
        })
      ).json(),
    );
    const invite = issuedWorkspaceInviteSchema.parse(
      await (
        await admin.request.post(`/api/workspaces/${workspace.id}/invites`, {
          data: { email: recipient.user.email, role: "admin" },
        })
      ).json(),
    );
    expect(
      (
        await page.request.post("/api/workspace-invites/accept", {
          data: { token: invite.token },
        })
      ).status(),
    ).toBe(200);
    const accepted = meSchema
      .parse(await (await page.request.get("/api/me")).json())
      .workspaces.find((item) => item.id === workspace.id);
    if (!accepted) throw new Error("Accepted workspace membership is required");
    const members = memberListSchema.parse(
      await (
        await page.request.get(`/api/members?workspaceId=${workspace.id}`)
      ).json(),
    );
    const agent = members.find((member) => member.kind === "agent");
    if (!agent) throw new Error("Copied real agent is required");
    await page.goto("/orgs");
    await page.getByTestId(`workspace-${workspace.id}`).click();
    return { workspace: accepted, agent };
  } finally {
    await admin.close();
  }
}
