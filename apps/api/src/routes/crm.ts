import { type createCore, userPrincipal } from "@taff/core";
import {
  companyFilterSchema,
  companyInputSchema,
  companyUpdateSchema,
  contactCompanyInputSchema,
  contactFilterSchema,
  contactInputSchema,
  contactLinkInputSchema,
  contactUpdateSchema,
  crmArchiveInputSchema,
  crmSearchInputSchema,
  idSchema,
  workspaceQuerySchema,
} from "@taff/schemas";
import type { Context, Hono } from "hono";
import type { AppEnv } from "../app";

type Core = ReturnType<typeof createCore>;
const SCOPES = {
  companies: "company",
  projects: "project",
  tasks: "task",
} as const;

/** Query strings carry booleans as text; anything but true/false is invalid. */
function flag(value: string | undefined) {
  return value === undefined
    ? undefined
    : value === "true"
      ? true
      : value === "false"
        ? false
        : value;
}
/** DELETE archives (D4) and carries the version in the query string. */
function archiveVersion(c: Context<AppEnv>) {
  const { version, ...rest } = c.req.query();
  return crmArchiveInputSchema.parse({
    ...rest,
    version: version === undefined ? undefined : Number(version),
  }).version;
}

/** REST adapter for CRM: validation and the session principal, nothing more. */
export function registerCrmRoutes(app: Hono<AppEnv>, core: Core) {
  const me = (c: Context<AppEnv>) => userPrincipal(c.get("userId"));
  const id = (c: Context<AppEnv>, name = "id") =>
    idSchema.parse(c.req.param(name));

  app.get("/api/companies", async (c) => {
    const { workspaceId, includeArchived, ...rest } = c.req.query();
    const workspace = workspaceQuerySchema.parse({ workspaceId });
    return c.json(
      await core.listCompanies(
        me(c),
        workspace.workspaceId,
        companyFilterSchema.parse({
          ...rest,
          includeArchived: flag(includeArchived),
        }),
      ),
    );
  });
  app.post("/api/companies", async (c) => {
    const { workspaceId } = workspaceQuerySchema.parse(c.req.query());
    return c.json(
      await core.createCompany(
        me(c),
        workspaceId,
        companyInputSchema.parse(await c.req.json()),
      ),
      201,
    );
  });
  app.get("/api/companies/:id", async (c) =>
    c.json(await core.getCompany(me(c), id(c))),
  );
  app.patch("/api/companies/:id", async (c) =>
    c.json(
      await core.updateCompany(
        me(c),
        id(c),
        companyUpdateSchema.parse(await c.req.json()),
      ),
    ),
  );
  app.delete("/api/companies/:id", async (c) =>
    c.json(
      await core.updateCompany(me(c), id(c), {
        version: archiveVersion(c),
        archived: true,
      }),
    ),
  );
  app.get("/api/contacts", async (c) => {
    const { workspaceId, includeArchived, ...rest } = c.req.query();
    const workspace = workspaceQuerySchema.parse({ workspaceId });
    return c.json(
      await core.listContacts(
        me(c),
        workspace.workspaceId,
        contactFilterSchema.parse({
          ...rest,
          includeArchived: flag(includeArchived),
        }),
      ),
    );
  });
  app.post("/api/contacts", async (c) => {
    const { workspaceId } = workspaceQuerySchema.parse(c.req.query());
    return c.json(
      await core.createContact(
        me(c),
        workspaceId,
        contactInputSchema.parse(await c.req.json()),
      ),
      201,
    );
  });
  app.get("/api/contacts/:id", async (c) =>
    c.json(await core.getContactDetail(me(c), id(c))),
  );
  app.patch("/api/contacts/:id", async (c) =>
    c.json(
      await core.updateContact(
        me(c),
        id(c),
        contactUpdateSchema.parse(await c.req.json()),
      ),
    ),
  );
  app.delete("/api/contacts/:id", async (c) =>
    c.json(
      await core.updateContact(me(c), id(c), {
        version: archiveVersion(c),
        archived: true,
      }),
    ),
  );
  app.patch("/api/contacts/:id/company", async (c) =>
    c.json(
      await core.setContactCompany(
        me(c),
        id(c),
        contactCompanyInputSchema.parse(await c.req.json()),
      ),
    ),
  );
  for (const [path, scope] of Object.entries(SCOPES)) {
    app.get(`/api/${path}/:id/contacts`, async (c) =>
      c.json(await core.listContactLinks(me(c), scope, id(c))),
    );
    app.put(`/api/${path}/:id/contacts/:contactId`, async (c) =>
      c.json(
        await core.setContactRoles(
          me(c),
          scope,
          id(c),
          id(c, "contactId"),
          contactLinkInputSchema.parse(await c.req.json()),
        ),
      ),
    );
    app.delete(`/api/${path}/:id/contacts/:contactId`, async (c) =>
      c.json(await core.unlinkContact(me(c), scope, id(c), id(c, "contactId"))),
    );
  }
  app.get("/api/workspaces/:id/crm/audit", async (c) =>
    c.json(await core.auditCrm(me(c), id(c))),
  );
  app.get("/api/workspaces/:id/crm/search", async (c) => {
    const { q, ...rest } = c.req.query();
    const { query } = crmSearchInputSchema.parse({ ...rest, query: q ?? "" });
    return c.json(await core.searchCrm(me(c), id(c), query));
  });
}
