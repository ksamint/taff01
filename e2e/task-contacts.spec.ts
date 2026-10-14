import { expect, type Page, test } from "@playwright/test";
import {
  type ContactLink,
  contactLinkListSchema,
  contactSchema,
  projectSchema,
  setContactRolesResultSchema,
  taskSchema,
} from "../packages/schemas/src/index";
import { freshAccount, messages, type TestLocale } from "./support/account";

test.use({ actionTimeout: 15000 });

/** i18next-style interpolation of a message template. */
function fill(template: string, values: Record<string, string>) {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => values[key]!);
}

async function links(page: Page, path: string): Promise<ContactLink[]> {
  const response = await page.request.get(path);
  expect(response.status()).toBe(200);
  return contactLinkListSchema.parse(await response.json());
}
const roles = (list: ContactLink[]) =>
  Object.fromEntries(list.map((link) => [link.contact.name, link.roles]));

async function contact(page: Page, workspaceId: string, name: string) {
  const response = await page.request.post(
    `/api/contacts?workspaceId=${workspaceId}`,
    { data: { name, title: "Buyer" } },
  );
  expect(response.status()).toBe(201);
  return contactSchema.parse(await response.json());
}

async function putRoles(page: Page, path: string, body: { roles: string[] }) {
  const response = await page.request.put(path, { data: body });
  expect(response.status()).toBe(200);
}

test("task contacts: add with a role, exclusive sign-off moves, auto stakeholder and undo", async ({
  page,
}, info) => {
  const locale = info.project.name as TestLocale;
  const m = messages[locale];
  const me = await freshAccount(page, locale);
  const workspace = me.workspaces[0]!;
  const projectResponse = await page.request.post(
    `/api/projects?workspaceId=${workspace.id}`,
    { data: { name: `Checkout v2 ${locale}` } },
  );
  expect(projectResponse.status()).toBe(201);
  const project = projectSchema.parse(await projectResponse.json());
  const taskResponse = await page.request.post("/api/tasks", {
    data: {
      workspaceId: workspace.id,
      title: `Contacts ${locale} ${Date.now()}`,
      ownerId: workspace.memberId,
      projectId: project.id,
    },
  });
  expect(taskResponse.status()).toBe(201);
  const task = taskSchema.parse(await taskResponse.json());
  const taskLinks = `/api/tasks/${task.id}/contacts`;
  const projectLinks = `/api/projects/${project.id}/contacts`;
  const holder = await contact(page, workspace.id, `Wong ${locale}`);
  const newcomer = await contact(page, workspace.id, `李佩欣 ${locale}`);
  const colleague = await contact(page, workspace.id, `Chan ${locale}`);
  // Wong signs off on the task (and so is a project stakeholder); Chan is on
  // the task without a role; 李佩欣 is not linked anywhere yet.
  await putRoles(page, `${taskLinks}/${holder.id}`, { roles: ["signoff"] });
  await putRoles(page, `${taskLinks}/${colleague.id}`, { roles: [] });
  const signoff = m.crm.role.signoff;

  await page.goto(`/tasks/${task.id}`);
  await expect(page.getByTestId("task-detail-heading")).toHaveText(task.title);
  const section = page.getByTestId("task-contacts");
  await expect(section.getByTestId("task-contact")).toHaveCount(2);
  await expect(
    section
      .getByTestId("task-contact")
      .filter({ hasText: holder.name })
      .getByTestId("task-contact-roles"),
  ).toHaveText(signoff);

  // 1. Add 李佩欣 as the sign-off: she replaces Wong and joins the project.
  await section.getByTestId("task-contact-add").click();
  const picker = page.getByRole("dialog", { name: m.crm.contacts.add });
  await picker.getByTestId("task-contact-search").fill(newcomer.name);
  await expect(picker.getByTestId("task-contact-option")).toHaveCount(1);
  await picker.getByTestId("task-contact-option").click();
  await picker.getByTestId("task-contact-new-role-signoff").click();
  await expect(
    picker.getByTestId("task-contact-new-role-signoff"),
  ).toHaveAttribute("aria-pressed", "true");
  const added = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      new URL(response.url()).pathname === `${taskLinks}/${newcomer.id}`,
  );
  await picker.getByTestId("task-contact-confirm").click();
  const addResponse = await added;
  expect(addResponse.status()).toBe(200);
  const result = setContactRolesResultSchema.parse(await addResponse.json());
  expect(result.previousRoles).toBeNull();
  expect(result.addedProjectStakeholder).toBe(true);
  expect(result.replaced).toEqual([{ role: "signoff", contactId: holder.id }]);
  const toast = page.getByTestId("toast");
  await expect(toast).toContainText(
    fill(m.crm.toast.roleReplaced, {
      name: newcomer.name,
      role: signoff,
      previous: holder.name,
    }),
  );
  await expect(toast).toContainText(
    fill(m.crm.toast.addedStakeholder, {
      name: newcomer.name,
      project: project.name,
    }),
  );
  await expect(toast.getByTestId("toast-action")).toHaveText(m.actions.undo);
  await expect(
    section
      .getByTestId("task-contact")
      .filter({ hasText: newcomer.name })
      .getByTestId("task-contact-roles"),
  ).toHaveText(signoff);
  await expect(
    section
      .getByTestId("task-contact")
      .filter({ hasText: holder.name })
      .getByTestId("task-contact-roles"),
  ).toHaveText(m.crm.noRole);

  // Undo calls the inverse operations: remove her task and project links and
  // give Wong the sign-off back.
  const undone = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      new URL(response.url()).pathname === `${taskLinks}/${holder.id}`,
  );
  await toast.getByTestId("toast-action").click();
  expect((await undone).status()).toBe(200);
  await expect
    .poll(async () => roles(await links(page, taskLinks)))
    .toEqual({ [holder.name]: ["signoff"], [colleague.name]: [] });
  await expect
    .poll(async () =>
      (await links(page, projectLinks)).some(
        (link) => link.contactId === newcomer.id,
      ),
    )
    .toBe(false);
  await expect(section.getByTestId("task-contact")).toHaveCount(2);
  await expect(
    section
      .getByTestId("task-contact")
      .filter({ hasText: holder.name })
      .getByTestId("task-contact-roles"),
  ).toHaveText(signoff);

  // 2. Moving the exclusive sign-off with a role chip names the replaced holder.
  const chan = section
    .getByTestId("task-contact")
    .filter({ hasText: colleague.name });
  await chan.getByTestId("task-contact-edit").click();
  await expect(chan.getByTestId("task-contact-edit")).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  const moved = page.waitForResponse(
    (response) =>
      response.request().method() === "PUT" &&
      new URL(response.url()).pathname === `${taskLinks}/${colleague.id}`,
  );
  await chan.getByTestId("task-contact-role-signoff").click();
  const movedResult = setContactRolesResultSchema.parse(
    await (await moved).json(),
  );
  expect(movedResult.previousRoles).toEqual([]);
  expect(movedResult.addedProjectStakeholder).toBe(false);
  await expect(toast).toContainText(
    fill(m.crm.toast.roleReplaced, {
      name: colleague.name,
      role: signoff,
      previous: holder.name,
    }),
  );
  await expect(toast).not.toContainText(
    fill(m.crm.toast.addedStakeholder, {
      name: colleague.name,
      project: project.name,
    }),
  );
  await toast.getByTestId("toast-action").click();
  await expect
    .poll(async () => roles(await links(page, taskLinks)))
    .toEqual({ [holder.name]: ["signoff"], [colleague.name]: [] });

  // 3. Removing a contact offers undo, which re-adds it with its roles.
  const wong = section
    .getByTestId("task-contact")
    .filter({ hasText: holder.name });
  await wong.getByTestId("task-contact-edit").click();
  await wong.getByTestId("task-contact-remove").click();
  await expect(toast).toContainText(
    fill(m.crm.toast.removed, { name: holder.name }),
  );
  await expect(section.getByTestId("task-contact")).toHaveCount(1);
  await toast.getByTestId("toast-action").click();
  await expect
    .poll(async () => roles(await links(page, taskLinks)))
    .toEqual({ [holder.name]: ["signoff"], [colleague.name]: [] });
  await expect(section.getByTestId("task-contact")).toHaveCount(2);
});

test("task contacts explain that a task needs a project", async ({
  page,
}, info) => {
  const locale = info.project.name as TestLocale;
  const me = await freshAccount(page, locale);
  const workspace = me.workspaces[0]!;
  const response = await page.request.post("/api/tasks", {
    data: {
      workspaceId: workspace.id,
      title: `No project ${locale} ${Date.now()}`,
      ownerId: workspace.memberId,
    },
  });
  expect(response.status()).toBe(201);
  const task = taskSchema.parse(await response.json());
  await page.goto(`/tasks/${task.id}`);
  await expect(page.getByTestId("task-detail-heading")).toHaveText(task.title);
  await expect(page.getByTestId("task-contacts-no-project")).toHaveText(
    messages[locale].crm.contacts.needsProject,
  );
  await expect(page.getByTestId("task-contact-add")).toHaveCount(0);
});
