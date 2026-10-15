import {
  companies,
  companyContacts,
  contactRoles,
  contacts,
  type Database,
  projectContacts,
  projects,
  type Transaction,
  taskContacts,
  tasks,
  workspaces,
} from "@taff/db";
import {
  CONTACT_ROLE_RULES,
  type Company,
  type CompanyDetail,
  type CompanyFilter,
  type CompanyInput,
  type CompanyUpdate,
  type Contact,
  type ContactCompanyInput,
  type ContactDetail,
  type ContactFilter,
  type ContactInput,
  type ContactLink,
  type ContactLinkInput,
  type ContactRole,
  type ContactScope,
  type ContactUpdate,
  type CrmAuditIssue,
  type CrmSearchResult,
  companyFilterSchema,
  companyInputSchema,
  companyUpdateSchema,
  contactCompanyInputSchema,
  contactFilterSchema,
  contactInputSchema,
  contactLinkInputSchema,
  contactScopeSchema,
  contactUpdateSchema,
  crmSearchInputSchema,
  idSchema,
  roleAllowed,
  roleExclusive,
  SchemaError,
  type SetContactCompanyResult,
  type SetContactRolesResult,
  type UnlinkContactResult,
} from "@taff/schemas";
import { and, asc, eq, inArray, isNull, ne, type SQL, sql } from "drizzle-orm";
import { CoreError, type Principal } from "./index";
import { type Action, type Actor, can, type Resource } from "./permissions";
import { dtoProject } from "./planning";

function parse<T>(schema: { parse(v: unknown): T }, v: unknown): T {
  try {
    return schema.parse(v);
  } catch (e) {
    if (e instanceof SchemaError) throw new CoreError("invalid_input", 400);
    throw e;
  }
}
function invalid(): never {
  throw new CoreError("invalid_input", 400);
}
function conflict(): never {
  throw new CoreError("conflict", 409);
}
function notFound(): never {
  throw new CoreError("not_found", 404);
}
type CompanyRow = typeof companies.$inferSelect;
type ContactRow = typeof contacts.$inferSelect;
export function dtoCompany(row: CompanyRow): Company {
  return {
    ...row,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
/** Phone and email stay null unless the reader holds `contact:details`. */
export function dtoContact(row: ContactRow, details: boolean): Contact {
  return {
    ...row,
    phone: details ? row.phone : null,
    email: details ? row.email : null,
    archivedAt: row.archivedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}
const ROLE_ORDER = CONTACT_ROLE_RULES.map((rule) => rule.role);
const sortRoles = (roles: ContactRole[]) =>
  [...roles].sort((a, b) => ROLE_ORDER.indexOf(a) - ROLE_ORDER.indexOf(b));
/** The contact_roles column that names the linked entity for a scope. */
const roleColumn = (scope: ContactScope) =>
  scope === "company"
    ? contactRoles.companyId
    : scope === "project"
      ? contactRoles.projectId
      : contactRoles.taskId;
/** Case-insensitive literal substring match (no LIKE wildcards). */
const contains = (column: SQL, text: string) =>
  sql`position(${text} in lower(${column}))>0`;

type Dependencies = {
  db: Database;
  mutation<T>(p: Principal, run: (tx: Transaction) => Promise<T>): Promise<T>;
  requireMember(
    q: Database | Transaction,
    p: Principal,
    w: string,
    a: Action,
    r?: Resource,
  ): Promise<Actor>;
};
type Entity = {
  workspaceId: string;
  title: string;
  archived: boolean;
  /** For a task: its project, which every task contact must be a stakeholder of. */
  projectId: string | null;
};

export function createCrmOperations({
  db,
  mutation,
  requireMember,
}: Dependencies) {
  /** Who may read, and whether phone and email are visible to them. */
  async function reader(q: Database | Transaction, p: Principal, w: string) {
    const actor = await requireMember(q, p, w, "contact:read");
    return {
      actor,
      details: can(actor, "contact:details", { workspaceId: w }),
    };
  }
  async function lockWorkspace(tx: Transaction, w: string) {
    const [row] = await tx
      .select({ id: workspaces.id })
      .from(workspaces)
      .where(eq(workspaces.id, w))
      .for("update");
    if (!row) notFound();
  }
  async function findEntity(
    q: Database | Transaction,
    scope: ContactScope,
    id: string,
    lock = false,
  ): Promise<Entity> {
    if (scope === "company") {
      const [row] = await q
        .select()
        .from(companies)
        .where(eq(companies.id, id));
      if (!row) notFound();
      return {
        workspaceId: row.workspaceId,
        title: row.name,
        archived: !!row.archivedAt,
        projectId: null,
      };
    }
    if (scope === "project") {
      const [row] = await q.select().from(projects).where(eq(projects.id, id));
      if (!row) notFound();
      return {
        workspaceId: row.workspaceId,
        title: row.name,
        archived: row.archived,
        projectId: row.id,
      };
    }
    const query = q.select().from(tasks).where(eq(tasks.id, id));
    // A task link reads the task's project; a share lock keeps it from
    // moving (updateTask locks the task FOR UPDATE) until the link is written.
    const [row] = lock ? await query.for("share") : await query;
    if (!row) notFound();
    return {
      workspaceId: row.workspaceId,
      title: row.title,
      archived: !!row.archivedAt,
      projectId: row.projectId,
    };
  }
  async function rolesFor(
    q: Database | Transaction,
    scope: ContactScope,
    entityId: string,
    contactIds?: string[],
  ) {
    const rows = await q
      .select({ contactId: contactRoles.contactId, role: contactRoles.role })
      .from(contactRoles)
      .where(
        and(
          eq(contactRoles.scope, scope),
          eq(roleColumn(scope), entityId),
          contactIds ? inArray(contactRoles.contactId, contactIds) : undefined,
        ),
      );
    const byContact = new Map<string, ContactRole[]>();
    for (const row of rows)
      byContact.set(row.contactId, [
        ...(byContact.get(row.contactId) ?? []),
        row.role as ContactRole,
      ]);
    return byContact;
  }
  /** The link table rows (joined with their contact) for one entity. */
  async function linkRows(
    q: Database | Transaction,
    scope: ContactScope,
    entityId: string,
    contactId?: string,
  ): Promise<ContactRow[]> {
    const table =
      scope === "company"
        ? companyContacts
        : scope === "project"
          ? projectContacts
          : taskContacts;
    const entity =
      scope === "company"
        ? companyContacts.companyId
        : scope === "project"
          ? projectContacts.projectId
          : taskContacts.taskId;
    const rows = await q
      .select({ contact: contacts })
      .from(table)
      .innerJoin(
        contacts,
        and(
          eq(contacts.id, table.contactId),
          eq(contacts.workspaceId, table.workspaceId),
        ),
      )
      .where(
        and(
          eq(entity, entityId),
          contactId ? eq(table.contactId, contactId) : undefined,
        ),
      )
      .orderBy(asc(contacts.name), asc(contacts.id));
    return rows.map((row) => row.contact);
  }
  async function links(
    q: Database | Transaction,
    scope: ContactScope,
    entityId: string,
    details: boolean,
    contactId?: string,
  ): Promise<ContactLink[]> {
    const rows = await linkRows(q, scope, entityId, contactId);
    if (!rows.length) return [];
    const roles = await rolesFor(
      q,
      scope,
      entityId,
      rows.map((row) => row.id),
    );
    return rows.map((row) => ({
      scope,
      entityId,
      contactId: row.id,
      roles: sortRoles(roles.get(row.id) ?? []),
      contact: dtoContact(row, details),
    }));
  }
  async function validCompany(
    q: Database | Transaction,
    w: string,
    id: string | null | undefined,
  ) {
    if (!id) return;
    const [row] = await q
      .select({ archivedAt: companies.archivedAt })
      .from(companies)
      .where(and(eq(companies.id, id), eq(companies.workspaceId, w)))
      .for("share");
    if (!row || row.archivedAt) invalid();
  }

  // Companies -----------------------------------------------------------------
  async function listCompanies(
    p: Principal,
    w: string,
    filter: CompanyFilter = {},
  ): Promise<Company[]> {
    parse(idSchema, w);
    const body = parse(companyFilterSchema, filter);
    await reader(db, p, w);
    return (
      await db
        .select()
        .from(companies)
        .where(
          and(
            eq(companies.workspaceId, w),
            body.includeArchived ? undefined : isNull(companies.archivedAt),
          ),
        )
        .orderBy(asc(companies.name), asc(companies.id))
    ).map(dtoCompany);
  }
  async function getCompany(p: Principal, id: string): Promise<CompanyDetail> {
    parse(idSchema, id);
    const [row] = await db.select().from(companies).where(eq(companies.id, id));
    if (!row) notFound();
    const { actor, details } = await reader(db, p, row.workspaceId);
    const finance = can(actor, "finance:read", {
      workspaceId: row.workspaceId,
    });
    const employees = await db
      .select()
      .from(contacts)
      .where(
        and(
          eq(contacts.workspaceId, row.workspaceId),
          eq(contacts.companyId, id),
          isNull(contacts.archivedAt),
        ),
      )
      .orderBy(asc(contacts.name), asc(contacts.id));
    const clientProjects = await db
      .select()
      .from(projects)
      .where(
        and(
          eq(projects.workspaceId, row.workspaceId),
          eq(projects.clientCompanyId, id),
        ),
      )
      .orderBy(asc(projects.createdAt), asc(projects.id));
    return {
      company: dtoCompany(row),
      contacts: employees.map((contact) => dtoContact(contact, details)),
      links: await links(db, "company", id, details),
      projects: clientProjects.map((project) => dtoProject(project, finance)),
    };
  }
  async function createCompany(
    p: Principal,
    w: string,
    input: CompanyInput,
  ): Promise<Company> {
    parse(idSchema, w);
    const body = parse(companyInputSchema, input);
    return mutation(p, async (tx) => {
      await requireMember(tx, p, w, "contact:manage");
      const [row] = await tx
        .insert(companies)
        .values({ workspaceId: w, name: body.name, industry: body.industry })
        .returning();
      return dtoCompany(row);
    });
  }
  async function updateCompany(
    p: Principal,
    id: string,
    input: CompanyUpdate,
  ): Promise<Company> {
    parse(idSchema, id);
    const body = parse(companyUpdateSchema, input);
    return mutation(p, async (tx) => {
      const [row] = await tx
        .select()
        .from(companies)
        .where(eq(companies.id, id))
        .for("update");
      if (!row) notFound();
      if (body.name !== undefined || body.industry !== undefined)
        await requireMember(tx, p, row.workspaceId, "contact:manage");
      if (body.archived !== undefined)
        await requireMember(tx, p, row.workspaceId, "crm:archive");
      if (row.version !== body.version) conflict();
      const { version: _, archived, ...fields } = body;
      const [updated] = await tx
        .update(companies)
        .set({
          ...fields,
          ...(archived === undefined
            ? {}
            : { archivedAt: archived ? (row.archivedAt ?? new Date()) : null }),
          version: row.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(companies.id, id))
        .returning();
      return dtoCompany(updated);
    });
  }

  // Contacts ------------------------------------------------------------------
  async function listContacts(
    p: Principal,
    w: string,
    filter: ContactFilter = {},
  ): Promise<Contact[]> {
    parse(idSchema, w);
    const body = parse(contactFilterSchema, filter);
    const { details } = await reader(db, p, w);
    const text = body.query?.toLowerCase() ?? "";
    // Without contact details a query must not reveal phone or email by match.
    const columns = details
      ? [contacts.name, contacts.title, contacts.email, contacts.phone]
      : [contacts.name, contacts.title];
    const listed = (
      await db
        .select()
        .from(contacts)
        .where(
          and(
            eq(contacts.workspaceId, w),
            body.companyId ? eq(contacts.companyId, body.companyId) : undefined,
            body.includeArchived ? undefined : isNull(contacts.archivedAt),
            text
              ? sql`(${sql.join(
                  columns.map((column) => contains(sql`${column}`, text)),
                  sql` OR `,
                )})`
              : undefined,
          ),
        )
        .orderBy(asc(contacts.name), asc(contacts.id))
    ).map((row) => dtoContact(row, details));
    if (!listed.length) return listed;
    const roles = await db
      .select({ contactId: contactRoles.contactId, role: contactRoles.role })
      .from(contactRoles)
      .where(
        and(
          eq(contactRoles.workspaceId, w),
          inArray(
            contactRoles.contactId,
            listed.map((contact) => contact.id),
          ),
        ),
      );
    const byContact = new Map<string, Set<ContactRole>>();
    for (const { contactId, role } of roles) {
      const values = byContact.get(contactId) ?? new Set<ContactRole>();
      values.add(role as ContactRole);
      byContact.set(contactId, values);
    }
    return listed.map((contact) => ({
      ...contact,
      roles: sortRoles([...(byContact.get(contact.id) ?? [])]),
    }));
  }
  async function getContactDetail(
    p: Principal,
    id: string,
  ): Promise<ContactDetail> {
    parse(idSchema, id);
    const [row] = await db.select().from(contacts).where(eq(contacts.id, id));
    if (!row) notFound();
    const { details } = await reader(db, p, row.workspaceId);
    const [company] = row.companyId
      ? await db
          .select()
          .from(companies)
          .where(
            and(
              eq(companies.id, row.companyId),
              eq(companies.workspaceId, row.workspaceId),
            ),
          )
      : [];
    const roleRows = await db
      .select()
      .from(contactRoles)
      .where(
        and(
          eq(contactRoles.contactId, id),
          eq(contactRoles.workspaceId, row.workspaceId),
        ),
      );
    const rolesOf = (scope: ContactScope, entityId: string) =>
      sortRoles(
        roleRows
          .filter(
            (role) =>
              role.scope === scope &&
              (scope === "company"
                ? role.companyId
                : scope === "project"
                  ? role.projectId
                  : role.taskId) === entityId,
          )
          .map((role) => role.role as ContactRole),
      );
    const companyLinks = await db
      .select({ id: companies.id, title: companies.name })
      .from(companyContacts)
      .innerJoin(companies, eq(companies.id, companyContacts.companyId))
      .where(eq(companyContacts.contactId, id))
      .orderBy(asc(companies.name));
    const projectLinks = await db
      .select({ id: projects.id, title: projects.name })
      .from(projectContacts)
      .innerJoin(projects, eq(projects.id, projectContacts.projectId))
      .where(eq(projectContacts.contactId, id))
      .orderBy(asc(projects.name));
    const taskLinks = await db
      .select({
        id: tasks.id,
        title: tasks.title,
        projectId: taskContacts.projectId,
      })
      .from(taskContacts)
      .innerJoin(tasks, eq(tasks.id, taskContacts.taskId))
      .where(eq(taskContacts.contactId, id))
      .orderBy(asc(tasks.title));
    return {
      contact: dtoContact(row, details),
      company: company ? dtoCompany(company) : null,
      links: [
        ...companyLinks.map((link) => ({
          scope: "company" as const,
          entityId: link.id,
          title: link.title,
          projectId: null,
          roles: rolesOf("company", link.id),
        })),
        ...projectLinks.map((link) => ({
          scope: "project" as const,
          entityId: link.id,
          title: link.title,
          projectId: link.id,
          roles: rolesOf("project", link.id),
        })),
        ...taskLinks.map((link) => ({
          scope: "task" as const,
          entityId: link.id,
          title: link.title,
          projectId: link.projectId,
          roles: rolesOf("task", link.id),
        })),
      ],
    };
  }
  async function createContact(
    p: Principal,
    w: string,
    input: ContactInput,
  ): Promise<Contact> {
    parse(idSchema, w);
    const body = parse(contactInputSchema, input);
    return mutation(p, async (tx) => {
      const actor = await requireMember(tx, p, w, "contact:manage");
      await validCompany(tx, w, body.companyId);
      const [row] = await tx
        .insert(contacts)
        .values({
          workspaceId: w,
          companyId: body.companyId ?? null,
          name: body.name,
          title: body.title,
          phone: body.phone,
          email: body.email,
        })
        .returning();
      return dtoContact(row, can(actor, "contact:details", { workspaceId: w }));
    });
  }
  async function updateContact(
    p: Principal,
    id: string,
    input: ContactUpdate,
  ): Promise<Contact> {
    parse(idSchema, id);
    const body = parse(contactUpdateSchema, input);
    return mutation(p, async (tx) => {
      const [row] = await tx
        .select()
        .from(contacts)
        .where(eq(contacts.id, id))
        .for("update");
      if (!row) notFound();
      const { version: _, archived, ...fields } = body;
      const actor = await requireMember(
        tx,
        p,
        row.workspaceId,
        Object.values(fields).some((value) => value !== undefined)
          ? "contact:manage"
          : "contact:read",
      );
      if (archived !== undefined)
        await requireMember(tx, p, row.workspaceId, "crm:archive");
      if (row.version !== body.version) conflict();
      const [updated] = await tx
        .update(contacts)
        .set({
          ...fields,
          ...(archived === undefined
            ? {}
            : { archivedAt: archived ? (row.archivedAt ?? new Date()) : null }),
          version: row.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(contacts.id, id))
        .returning();
      return dtoContact(
        updated,
        can(actor, "contact:details", { workspaceId: row.workspaceId }),
      );
    });
  }
  async function setContactCompany(
    p: Principal,
    id: string,
    input: ContactCompanyInput,
  ): Promise<SetContactCompanyResult> {
    parse(idSchema, id);
    const body = parse(contactCompanyInputSchema, input);
    return mutation(p, async (tx) => {
      const [first] = await tx
        .select({ workspaceId: contacts.workspaceId })
        .from(contacts)
        .where(eq(contacts.id, id));
      if (!first) notFound();
      await lockWorkspace(tx, first.workspaceId);
      const [row] = await tx
        .select()
        .from(contacts)
        .where(eq(contacts.id, id))
        .for("update");
      const actor = await requireMember(
        tx,
        p,
        row.workspaceId,
        "contact:manage",
      );
      const details = can(actor, "contact:details", {
        workspaceId: row.workspaceId,
      });
      if (row.version !== body.version) conflict();
      const previousCompanyId = row.companyId;
      if (body.companyId === previousCompanyId)
        return {
          contact: dtoContact(row, details),
          dropped: 0,
          previousCompanyId,
        };
      await validCompany(tx, row.workspaceId, body.companyId);
      // company_contacts references contacts(workspace_id, id, company_id), so
      // the links at the old employer (and their roles, by cascade) go first.
      const dropped = previousCompanyId
        ? await tx
            .delete(companyContacts)
            .where(
              and(
                eq(companyContacts.workspaceId, row.workspaceId),
                eq(companyContacts.contactId, id),
                eq(companyContacts.companyId, previousCompanyId),
              ),
            )
            .returning({ id: companyContacts.id })
        : [];
      const [updated] = await tx
        .update(contacts)
        .set({
          companyId: body.companyId,
          version: row.version + 1,
          updatedAt: new Date(),
        })
        .where(eq(contacts.id, id))
        .returning();
      return {
        contact: dtoContact(updated, details),
        dropped: dropped.length,
        previousCompanyId,
      };
    });
  }

  // Links ---------------------------------------------------------------------
  async function listContactLinks(
    p: Principal,
    scope: ContactScope,
    entityId: string,
  ): Promise<ContactLink[]> {
    parse(contactScopeSchema, scope);
    parse(idSchema, entityId);
    const entity = await findEntity(db, scope, entityId);
    const { details } = await reader(db, p, entity.workspaceId);
    return links(db, scope, entityId, details);
  }
  async function setContactRoles(
    p: Principal,
    scope: ContactScope,
    entityId: string,
    contactId: string,
    input: ContactLinkInput,
  ): Promise<SetContactRolesResult> {
    parse(contactScopeSchema, scope);
    parse(idSchema, entityId);
    parse(idSchema, contactId);
    const body = parse(contactLinkInputSchema, input);
    if (body.roles.some((role) => !roleAllowed(role, scope))) invalid();
    const roles = sortRoles(body.roles);
    return mutation(p, async (tx) => {
      const { workspaceId } = await findEntity(tx, scope, entityId);
      // Every link mutation locks the workspace first, which serializes
      // exclusive-role moves and keeps one lock order.
      await lockWorkspace(tx, workspaceId);
      const entity = await findEntity(tx, scope, entityId, true);
      const actor = await requireMember(tx, p, workspaceId, "contact:manage");
      const details = can(actor, "contact:details", { workspaceId });
      const [contact] = await tx
        .select()
        .from(contacts)
        .where(
          and(
            eq(contacts.id, contactId),
            eq(contacts.workspaceId, workspaceId),
          ),
        )
        .for("share");
      if (!contact) invalid();
      const existing = await linkRows(tx, scope, entityId, contactId);
      let previousRoles: ContactRole[] | null = null;
      let addedProjectStakeholder = false;
      if (existing.length) {
        previousRoles = sortRoles(
          (await rolesFor(tx, scope, entityId, [contactId])).get(contactId) ??
            [],
        );
      } else {
        if (contact.archivedAt || entity.archived) invalid();
        if (scope === "company") {
          // Only the employer can be linked (company_contacts_employer_fk).
          if (contact.companyId !== entityId) invalid();
          await tx
            .insert(companyContacts)
            .values({ workspaceId, companyId: entityId, contactId });
        } else if (scope === "project") {
          await tx
            .insert(projectContacts)
            .values({ workspaceId, projectId: entityId, contactId });
        } else {
          if (!entity.projectId) invalid();
          // A task contact is always a stakeholder of the task's project.
          addedProjectStakeholder =
            (
              await tx
                .insert(projectContacts)
                .values({ workspaceId, projectId: entity.projectId, contactId })
                .onConflictDoNothing()
                .returning({ id: projectContacts.id })
            ).length > 0;
          await tx.insert(taskContacts).values({
            workspaceId,
            taskId: entityId,
            projectId: entity.projectId,
            contactId,
          });
        }
      }
      const replaced: SetContactRolesResult["replaced"] = [];
      for (const role of roles.filter(roleExclusive)) {
        const moved = await tx
          .delete(contactRoles)
          .where(
            and(
              eq(contactRoles.workspaceId, workspaceId),
              eq(contactRoles.scope, scope),
              eq(roleColumn(scope), entityId),
              eq(contactRoles.role, role),
              ne(contactRoles.contactId, contactId),
            ),
          )
          .returning({ contactId: contactRoles.contactId });
        for (const holder of moved)
          replaced.push({ role, contactId: holder.contactId });
      }
      const before = previousRoles ?? [];
      const removed = before.filter((role) => !roles.includes(role));
      if (removed.length)
        await tx
          .delete(contactRoles)
          .where(
            and(
              eq(contactRoles.workspaceId, workspaceId),
              eq(contactRoles.scope, scope),
              eq(roleColumn(scope), entityId),
              eq(contactRoles.contactId, contactId),
              inArray(contactRoles.role, removed),
            ),
          );
      const added = roles.filter((role) => !before.includes(role));
      if (added.length)
        await tx.insert(contactRoles).values(
          added.map((role) => ({
            workspaceId,
            contactId,
            scope,
            role,
            companyId: scope === "company" ? entityId : null,
            projectId: scope === "project" ? entityId : null,
            taskId: scope === "task" ? entityId : null,
          })),
        );
      const [link] = await links(tx, scope, entityId, details, contactId);
      return { link, replaced, addedProjectStakeholder, previousRoles };
    });
  }
  async function unlinkContact(
    p: Principal,
    scope: ContactScope,
    entityId: string,
    contactId: string,
  ): Promise<UnlinkContactResult> {
    parse(contactScopeSchema, scope);
    parse(idSchema, entityId);
    parse(idSchema, contactId);
    return mutation(p, async (tx) => {
      const { workspaceId } = await findEntity(tx, scope, entityId);
      await lockWorkspace(tx, workspaceId);
      await requireMember(tx, p, workspaceId, "contact:manage");
      let cascadedTaskLinks = 0;
      let deleted: { id: string }[];
      if (scope === "company")
        deleted = await tx
          .delete(companyContacts)
          .where(
            and(
              eq(companyContacts.workspaceId, workspaceId),
              eq(companyContacts.companyId, entityId),
              eq(companyContacts.contactId, contactId),
            ),
          )
          .returning({ id: companyContacts.id });
      else if (scope === "task")
        deleted = await tx
          .delete(taskContacts)
          .where(
            and(
              eq(taskContacts.workspaceId, workspaceId),
              eq(taskContacts.taskId, entityId),
              eq(taskContacts.contactId, contactId),
            ),
          )
          .returning({ id: taskContacts.id });
      else {
        // Removing a stakeholder removes its task links on this project
        // (task_contacts_stakeholder_fk cascades); report how many.
        cascadedTaskLinks = (
          await tx
            .select({ id: taskContacts.id })
            .from(taskContacts)
            .where(
              and(
                eq(taskContacts.workspaceId, workspaceId),
                eq(taskContacts.projectId, entityId),
                eq(taskContacts.contactId, contactId),
              ),
            )
        ).length;
        deleted = await tx
          .delete(projectContacts)
          .where(
            and(
              eq(projectContacts.workspaceId, workspaceId),
              eq(projectContacts.projectId, entityId),
              eq(projectContacts.contactId, contactId),
            ),
          )
          .returning({ id: projectContacts.id });
      }
      if (!deleted.length) notFound();
      return { cascadedTaskLinks };
    });
  }

  // Audit and search ----------------------------------------------------------
  async function auditCrm(p: Principal, w: string): Promise<CrmAuditIssue[]> {
    parse(idSchema, w);
    await requireMember(db, p, w, "crm:audit");
    const allowed = sql.join(
      CONTACT_ROLE_RULES.flatMap((rule) =>
        rule.scopes.map((scope) => sql`(${scope}::text,${rule.role}::text)`),
      ),
      sql`,`,
    );
    const exclusive = sql.join(
      CONTACT_ROLE_RULES.filter((rule) => rule.exclusive).map(
        (rule) => sql`${rule.role}::text`,
      ),
      sql`,`,
    );
    // Each query reports what the constraints should make impossible; a
    // healthy workspace returns no rows.
    const rows = await db.execute<CrmAuditIssue>(sql`
      SELECT 'foreign_company_link' AS code, cc.id::text AS id
        FROM company_contacts cc LEFT JOIN contacts c ON c.id = cc.contact_id
        WHERE cc.workspace_id = ${w} AND c.company_id IS DISTINCT FROM cc.company_id
      UNION ALL
      SELECT 'task_contact_not_stakeholder', tc.id::text
        FROM task_contacts tc LEFT JOIN tasks t ON t.id = tc.task_id
        WHERE tc.workspace_id = ${w} AND (
          t.project_id IS DISTINCT FROM tc.project_id OR NOT EXISTS (
            SELECT 1 FROM project_contacts pc WHERE pc.workspace_id = tc.workspace_id
              AND pc.project_id = tc.project_id AND pc.contact_id = tc.contact_id))
      UNION ALL
      SELECT 'role_out_of_scope', r.id::text FROM contact_roles r
        WHERE r.workspace_id = ${w} AND (
          (r.scope, r.role) NOT IN (${allowed})
          OR (r.scope = 'company' AND NOT EXISTS (SELECT 1 FROM company_contacts l
            WHERE l.company_id = r.company_id AND l.contact_id = r.contact_id))
          OR (r.scope = 'project' AND NOT EXISTS (SELECT 1 FROM project_contacts l
            WHERE l.project_id = r.project_id AND l.contact_id = r.contact_id))
          OR (r.scope = 'task' AND NOT EXISTS (SELECT 1 FROM task_contacts l
            WHERE l.task_id = r.task_id AND l.contact_id = r.contact_id)))
      UNION ALL
      SELECT 'exclusive_role_conflict', id::text FROM (
        SELECT id, count(*) OVER (PARTITION BY scope, role, company_id, project_id, task_id) AS holders
          FROM contact_roles WHERE workspace_id = ${w} AND role IN (${exclusive})) held
        WHERE holders > 1
      UNION ALL
      SELECT 'cross_workspace_link', x.id::text FROM company_contacts x
        LEFT JOIN contacts c ON c.id = x.contact_id LEFT JOIN companies o ON o.id = x.company_id
        WHERE (x.workspace_id = ${w} OR c.workspace_id = ${w} OR o.workspace_id = ${w})
          AND (c.workspace_id IS DISTINCT FROM x.workspace_id OR o.workspace_id IS DISTINCT FROM x.workspace_id)
      UNION ALL
      SELECT 'cross_workspace_link', x.id::text FROM project_contacts x
        LEFT JOIN contacts c ON c.id = x.contact_id LEFT JOIN projects o ON o.id = x.project_id
        WHERE (x.workspace_id = ${w} OR c.workspace_id = ${w} OR o.workspace_id = ${w})
          AND (c.workspace_id IS DISTINCT FROM x.workspace_id OR o.workspace_id IS DISTINCT FROM x.workspace_id)
      UNION ALL
      SELECT 'cross_workspace_link', x.id::text FROM task_contacts x
        LEFT JOIN contacts c ON c.id = x.contact_id LEFT JOIN tasks o ON o.id = x.task_id
        WHERE (x.workspace_id = ${w} OR c.workspace_id = ${w} OR o.workspace_id = ${w})
          AND (c.workspace_id IS DISTINCT FROM x.workspace_id OR o.workspace_id IS DISTINCT FROM x.workspace_id)
      UNION ALL
      SELECT 'cross_workspace_link', x.id::text FROM contact_roles x
        LEFT JOIN contacts c ON c.id = x.contact_id
        WHERE (x.workspace_id = ${w} OR c.workspace_id = ${w})
          AND c.workspace_id IS DISTINCT FROM x.workspace_id
      UNION ALL
      SELECT 'cross_workspace_link', x.id::text FROM contacts x
        JOIN companies o ON o.id = x.company_id
        WHERE (x.workspace_id = ${w} OR o.workspace_id = ${w})
          AND o.workspace_id <> x.workspace_id
    `);
    return [...rows].map((row) => ({ code: row.code, id: row.id }));
  }
  async function searchCrm(
    p: Principal,
    w: string,
    query: string,
  ): Promise<CrmSearchResult> {
    parse(idSchema, w);
    const text = parse(crmSearchInputSchema, { query }).query.toLowerCase();
    const { details } = await reader(db, p, w);
    const companyRows = await db
      .select()
      .from(companies)
      .where(
        and(
          eq(companies.workspaceId, w),
          isNull(companies.archivedAt),
          text
            ? sql`(${contains(sql`${companies.name}`, text)} OR ${contains(sql`${companies.industry}`, text)})`
            : undefined,
        ),
      )
      .orderBy(asc(companies.name), asc(companies.id))
      .limit(20);
    const columns = details
      ? [contacts.name, contacts.title, contacts.email, contacts.phone]
      : [contacts.name, contacts.title];
    const contactRows = await db
      .select()
      .from(contacts)
      .where(
        and(
          eq(contacts.workspaceId, w),
          isNull(contacts.archivedAt),
          text
            ? sql`(${sql.join(
                columns.map((column) => contains(sql`${column}`, text)),
                sql` OR `,
              )})`
            : undefined,
        ),
      )
      .orderBy(asc(contacts.name), asc(contacts.id))
      .limit(20);
    return {
      companies: companyRows.map(dtoCompany),
      contacts: contactRows.map((row) => dtoContact(row, details)),
    };
  }
  return {
    operations: {
      listCompanies,
      getCompany,
      createCompany,
      updateCompany,
      listContacts,
      getContactDetail,
      createContact,
      updateContact,
      setContactCompany,
      listContactLinks,
      setContactRoles,
      unlinkContact,
      auditCrm,
      searchCrm,
    },
  };
}
