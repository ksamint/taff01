import { expect, type Page, test } from "@playwright/test";
import {
  type ContactLink,
  companySchema,
  contactDetailSchema,
  contactLinkListSchema,
  contactSchema,
  crmAuditSchema,
  meSchema,
  projectSchema,
  taskSchema,
  workspaceSchema,
} from "../packages/schemas/src/index";
import { messages, type TestLocale } from "./support/messages";
import { selectLocale } from "./support/preferences";

// M15 CRM screens: every CRM write shows a toast whose 撤銷 calls the inverse
// API, and the read-only CRM audit stays clean after each scenario.
test.use({ actionTimeout: 15000 });

type Workspace = { id: string; memberId: string };

/** i18next-style interpolation of a message template. */
function fill(template: string, values: Record<string, string | number>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) =>
    String(values[key]),
  );
}

/** Signs in as the admin demo user and opens a new workspace they own. */
async function setUp(page: Page, locale: TestLocale): Promise<Workspace> {
  if (!process.env.DEMO_PASSWORD) throw new Error("DEMO_PASSWORD is required");
  await page.goto("/");
  await page
    .getByTestId("auth-email")
    .fill(process.env.DEMO_EMAIL ?? "alex@taff.local");
  await page.getByTestId("auth-password").fill(process.env.DEMO_PASSWORD);
  await page.getByTestId("auth-submit").click();
  await expect(page.getByTestId("today-heading")).toBeVisible();
  await selectLocale(page, locale);
  const response = await page.request.post("/api/workspaces", {
    data: { name: `CRM ${locale} ${Date.now()}` },
  });
  expect(response.status()).toBe(201);
  const workspace = workspaceSchema.parse(await response.json());
  await page.goto("/orgs");
  await page.getByTestId(`workspace-${workspace.id}`).click();
  const me = meSchema.parse(await (await page.request.get("/api/me")).json());
  const member = me.workspaces.find((item) => item.id === workspace.id);
  expect(member?.role).toBe("admin");
  return { id: workspace.id, memberId: member!.memberId };
}

/** The CRM audit (admin, read-only) finds nothing to repair. */
async function expectCleanAudit(page: Page, workspace: Workspace) {
  const response = await page.request.get(
    `/api/workspaces/${workspace.id}/crm/audit`,
  );
  expect(response.status()).toBe(200);
  expect(crmAuditSchema.parse(await response.json())).toEqual([]);
}

async function post<T>(
  page: Page,
  path: string,
  data: object,
  parse: (value: unknown) => T,
) {
  const response = await page.request.post(path, { data });
  expect(response.status()).toBe(201);
  return parse(await response.json());
}
const company = (page: Page, workspace: Workspace, name: string) =>
  post(page, `/api/companies?workspaceId=${workspace.id}`, { name }, (v) =>
    companySchema.parse(v),
  );
const contact = (
  page: Page,
  workspace: Workspace,
  name: string,
  companyId: string | null = null,
) =>
  post(
    page,
    `/api/contacts?workspaceId=${workspace.id}`,
    { name, title: "Buyer", companyId },
    (v) => contactSchema.parse(v),
  );
const project = (page: Page, workspace: Workspace, name: string) =>
  post(page, `/api/projects?workspaceId=${workspace.id}`, { name }, (v) =>
    projectSchema.parse(v),
  );
const task = (
  page: Page,
  workspace: Workspace,
  title: string,
  projectId: string,
) =>
  post(
    page,
    "/api/tasks",
    {
      workspaceId: workspace.id,
      title,
      ownerId: workspace.memberId,
      projectId,
    },
    (v) => taskSchema.parse(v),
  );
async function putRoles(page: Page, path: string, roles: string[]) {
  const response = await page.request.put(path, { data: { roles } });
  expect(response.status()).toBe(200);
}
async function links(page: Page, path: string): Promise<ContactLink[]> {
  const response = await page.request.get(path);
  expect(response.status()).toBe(200);
  return contactLinkListSchema.parse(await response.json());
}
const roles = (list: ContactLink[]) =>
  Object.fromEntries(list.map((link) => [link.contact.name, link.roles]));

test("exclusive chair moves at a company, with toast and undo", async ({
  page,
}, info) => {
  const locale = info.project.name as TestLocale;
  const m = messages[locale];
  const workspace = await setUp(page, locale);
  const acme = await company(page, workspace, `Acme ${locale}`);
  const holder = await contact(page, workspace, `Wong ${locale}`, acme.id);
  const newcomer = await contact(page, workspace, `陳大文 ${locale}`, acme.id);
  const companyLinks = `/api/companies/${acme.id}/contacts`;
  await putRoles(page, `${companyLinks}/${holder.id}`, ["chair"]);
  const chair = m.crm.role.chair;

  await page.goto("/companies");
  await page.getByTestId("company-row").filter({ hasText: acme.name }).click();
  await expect(page).toHaveURL(new RegExp(`/companies/${acme.id}$`));
  await expect(page.getByTestId("company-heading")).toHaveText(acme.name);
  const row = (name: string) =>
    page.getByTestId("company-contact").filter({ hasText: name });
  await expect(
    row(holder.name).getByTestId("company-contact-roles"),
  ).toHaveText(chair);
  await expect(
    row(newcomer.name).getByTestId("company-contact-roles"),
  ).toHaveText(m.crm.noRole);

  await row(newcomer.name).getByTestId("company-contact-edit").click();
  await row(newcomer.name).getByTestId("company-contact-role-chair").click();
  const toast = page.getByTestId("toast");
  await expect(toast).toContainText(
    fill(m.crm.toast.roleReplaced, {
      name: newcomer.name,
      role: chair,
      previous: holder.name,
    }),
  );
  await expect(
    row(newcomer.name).getByTestId("company-contact-roles"),
  ).toHaveText(chair);
  await expect(
    row(holder.name).getByTestId("company-contact-roles"),
  ).toHaveText(m.crm.noRole);
  await expect
    .poll(async () => roles(await links(page, companyLinks)))
    .toEqual({ [holder.name]: [], [newcomer.name]: ["chair"] });

  await toast.getByTestId("toast-action").click();
  await expect
    .poll(async () => roles(await links(page, companyLinks)))
    .toEqual({ [holder.name]: ["chair"] });
  await expect(
    row(holder.name).getByTestId("company-contact-roles"),
  ).toHaveText(chair);
  await expectCleanAudit(page, workspace);
});

test("a task contact becomes a project stakeholder, with toast and undo", async ({
  page,
}, info) => {
  const locale = info.project.name as TestLocale;
  const m = messages[locale];
  const workspace = await setUp(page, locale);
  const checkout = await project(page, workspace, `Checkout ${locale}`);
  const work = await task(page, workspace, `Pilot ${locale}`, checkout.id);
  const person = await contact(page, workspace, `李佩欣 ${locale}`);
  const projectLinks = `/api/projects/${checkout.id}/contacts`;
  const taskLinks = `/api/tasks/${work.id}/contacts`;

  await page.goto(`/tasks/${work.id}`);
  await expect(page.getByTestId("task-detail-heading")).toHaveText(work.title);
  const section = page.getByTestId("task-contacts");
  await section.getByTestId("task-contact-add").click();
  const picker = page.getByRole("dialog", { name: m.crm.contacts.add });
  await picker.getByTestId("task-contact-search").fill(person.name);
  await picker.getByTestId("task-contact-option").click();
  await picker.getByTestId("task-contact-new-role-tech").click();
  await picker.getByTestId("task-contact-confirm").click();
  const toast = page.getByTestId("toast");
  await expect(toast).toContainText(
    fill(m.crm.toast.addedStakeholder, {
      name: person.name,
      project: checkout.name,
    }),
  );
  await expect
    .poll(async () => roles(await links(page, projectLinks)))
    .toEqual({ [person.name]: [] });
  expect(roles(await links(page, taskLinks))).toEqual({
    [person.name]: ["tech"],
  });

  // Undo removes the task link and the stakeholder link it added.
  await toast.getByTestId("toast-action").click();
  await expect
    .poll(async () => (await links(page, projectLinks)).length)
    .toBe(0);
  expect(await links(page, taskLinks)).toEqual([]);
  await expect(section.getByTestId("task-contact")).toHaveCount(0);
  await expectCleanAudit(page, workspace);
});

test("removing a stakeholder cascades its task links, with the count and undo", async ({
  page,
}, info) => {
  const locale = info.project.name as TestLocale;
  const m = messages[locale];
  const workspace = await setUp(page, locale);
  const client = await company(page, workspace, `Northwind ${locale}`);
  const launch = await project(page, workspace, `Launch ${locale}`);
  const first = await task(page, workspace, `Brief ${locale}`, launch.id);
  const second = await task(page, workspace, `Review ${locale}`, launch.id);
  const person = await contact(page, workspace, `Chan ${locale}`, client.id);
  const projectLinks = `/api/projects/${launch.id}/contacts`;
  await putRoles(page, `${projectLinks}/${person.id}`, ["decider"]);
  await putRoles(page, `/api/tasks/${first.id}/contacts/${person.id}`, [
    "signoff",
  ]);
  await putRoles(page, `/api/tasks/${second.id}/contacts/${person.id}`, []);

  await page.goto(`/projects/${launch.id}?view=stakeholders`);
  const view = page.getByTestId("stakeholders-view");
  await expect(view).toBeVisible();
  const toast = page.getByTestId("toast");

  // The client company: an admin sets it with a toast and undo.
  const select = view.getByTestId("client-company-select");
  await select.selectOption(client.id);
  await expect(toast).toContainText(
    fill(m.crm.toast.clientSet, { company: client.name }),
  );
  await toast.getByTestId("toast-action").click();
  await expect
    .poll(async () => {
      const list = await page.request.get(
        `/api/projects?workspaceId=${workspace.id}`,
      );
      return ((await list.json()) as unknown[])
        .map((item) => projectSchema.parse(item))
        .find((item) => item.id === launch.id)?.clientCompanyId;
    })
    .toBeNull();
  await expect(select).toHaveValue("");

  const row = view.getByTestId("stakeholder").filter({ hasText: person.name });
  await expect(row.getByTestId("stakeholder-roles")).toHaveText(
    m.crm.role.decider,
  );
  await expect(view.getByTestId("stakeholders-count")).toHaveText("1");
  await row.getByTestId("stakeholder-edit").click();
  await row.getByTestId("stakeholder-remove").click();
  await expect(toast).toContainText(
    fill(m.crm.toast.removedWithLinks_other, { name: person.name, count: 2 }),
  );
  await expect(view.getByTestId("stakeholder")).toHaveCount(0);
  expect(await links(page, `/api/tasks/${first.id}/contacts`)).toEqual([]);

  // Undo re-adds the stakeholder and both task links with their roles.
  await toast.getByTestId("toast-action").click();
  await expect
    .poll(async () => roles(await links(page, projectLinks)))
    .toEqual({ [person.name]: ["decider"] });
  await expect
    .poll(async () =>
      roles(await links(page, `/api/tasks/${first.id}/contacts`)),
    )
    .toEqual({ [person.name]: ["signoff"] });
  // The undo steps run in order, so the last task link may land a moment later.
  await expect
    .poll(async () =>
      roles(await links(page, `/api/tasks/${second.id}/contacts`)),
    )
    .toEqual({ [person.name]: [] });
  await expect(view.getByTestId("stakeholder")).toHaveCount(1);
  await expectCleanAudit(page, workspace);
});

test("a company change drops old company roles, with toast and undo", async ({
  page,
}, info) => {
  const locale = info.project.name as TestLocale;
  const m = messages[locale];
  const workspace = await setUp(page, locale);
  const from = await company(page, workspace, `Old Co ${locale}`);
  const to = await company(page, workspace, `New Co ${locale}`);
  const person = await contact(page, workspace, `Ho ${locale}`, from.id);
  const fromLinks = `/api/companies/${from.id}/contacts`;
  await putRoles(page, `${fromLinks}/${person.id}`, ["decider", "finance"]);

  await page.goto("/contacts");
  await page.getByTestId("contact-search").fill(person.name);
  await expect(page.getByTestId("contact-row")).toHaveCount(1);
  await page.getByTestId("contact-row").click();
  await expect(page.getByTestId("contact-heading")).toHaveText(person.name);
  await expect(
    page
      .getByTestId("contact-link")
      .filter({ hasText: from.name })
      .getByTestId("contact-link-roles"),
  ).toHaveText(
    [m.crm.role.decider, m.crm.role.finance].join(m.crm.roleSeparator),
  );

  await page.getByTestId("contact-company-select").selectOption(to.id);
  const toast = page.getByTestId("toast");
  await expect(toast).toContainText(
    fill(m.crm.toast.companyChanged, { name: person.name, company: to.name }),
  );
  await expect(toast).toContainText(m.crm.toast.rolesCleared);
  await expect
    .poll(async () =>
      contactDetailSchema.parse(
        await (await page.request.get(`/api/contacts/${person.id}`)).json(),
      ),
    )
    .toMatchObject({ contact: { companyId: to.id }, links: [] });
  await expect(page.getByTestId("contact-link")).toHaveCount(0);

  // Undo moves the contact back and restores the dropped company roles.
  await toast.getByTestId("toast-action").click();
  await expect
    .poll(async () => roles(await links(page, fromLinks)))
    .toEqual({ [person.name]: ["decider", "finance"] });
  await expect(page.getByTestId("contact-company-select")).toHaveValue(from.id);
  await expectCleanAudit(page, workspace);
});

test("archiving a contact and a company asks first and can be undone", async ({
  page,
}, info) => {
  const locale = info.project.name as TestLocale;
  const m = messages[locale];
  const workspace = await setUp(page, locale);
  const acme = await company(page, workspace, `Archive Co ${locale}`);
  const person = await contact(page, workspace, `Lam ${locale}`, acme.id);
  const toast = page.getByTestId("toast");

  await page.goto(`/contacts/${person.id}`);
  await expect(page.getByTestId("contact-heading")).toHaveText(person.name);
  await page.getByTestId("contact-archive").click();
  const confirm = page.getByRole("dialog", { name: m.crm.contacts.delete });
  await expect(confirm.getByTestId("crm-confirm-body")).toHaveText(
    fill(m.crm.contacts.deleteConfirm, { name: person.name }),
  );
  await confirm.getByTestId("crm-confirm-ok").click();
  await expect(page).toHaveURL(/\/contacts$/);
  await expect(toast).toContainText(
    fill(m.crm.toast.deleted, { name: person.name }),
  );
  await expect(
    page.getByTestId("contact-row").filter({ hasText: person.name }),
  ).toHaveCount(0);
  await toast.getByTestId("toast-action").click();
  await expect
    .poll(
      async () =>
        contactDetailSchema.parse(
          await (await page.request.get(`/api/contacts/${person.id}`)).json(),
        ).contact.archivedAt,
    )
    .toBeNull();
  await expect(
    page.getByTestId("contact-row").filter({ hasText: person.name }),
  ).toHaveCount(1);

  await page.goto(`/companies/${acme.id}`);
  await page.getByTestId("company-archive").click();
  await page
    .getByRole("dialog", { name: m.crm.companies.delete })
    .getByTestId("crm-confirm-ok")
    .click();
  await expect(page).toHaveURL(/\/companies$/);
  await expect(toast).toContainText(
    fill(m.crm.toast.deleted, { name: acme.name }),
  );
  await expect(
    page.getByTestId("company-row").filter({ hasText: acme.name }),
  ).toHaveCount(0);
  await toast.getByTestId("toast-action").click();
  await expect(
    page.getByTestId("company-row").filter({ hasText: acme.name }),
  ).toHaveCount(1);
  await expectCleanAudit(page, workspace);
});
