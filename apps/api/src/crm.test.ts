import { CoreError, createCore } from "@taff/core";
import pino from "pino";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app";

const core = createCore({
  databaseUrl: "postgres://unused:unused@localhost:1/unused_test",
  authUrl: "http://localhost:3000",
  authSecret: "test-only-secret-with-at-least-32-characters",
  tokenPepper: "test-only-pepper-with-16-characters",
});
const app = createApp(core, "http://localhost:3000", pino({ enabled: false }), {
  limit: 100,
  hit: async () => ({ allowed: true, count: 1 }),
  close: async () => {},
});
const id = "00000000-0000-4000-8000-000000000001";
const other = "00000000-0000-4000-8000-000000000002";
const person = { kind: "user", userId: id };
const now = new Date();
const session = {
  session: {
    id,
    userId: id,
    token: "test-token",
    createdAt: now,
    updatedAt: now,
    expiresAt: new Date(now.getTime() + 60_000),
    ipAddress: null,
    userAgent: null,
  },
  user: {
    id,
    email: "person@example.com",
    emailVerified: false,
    systemAdmin: false,
    name: "Person",
    createdAt: now,
    updatedAt: now,
    image: null,
    locale: "en",
    tz: "UTC",
  },
};
const contact = {
  id: other,
  workspaceId: id,
  companyId: null,
  name: "Lee",
  title: "",
  phone: null,
  email: null,
  archivedAt: null,
  version: 1,
  createdAt: now.toISOString(),
  updatedAt: now.toISOString(),
};
const signIn = () =>
  vi.spyOn(core, "getSession").mockResolvedValue({
    response: session,
    headers: new Headers(),
  });
const send = (path: string, method: string, body?: unknown) =>
  app.request(path, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
afterEach(() => vi.restoreAllMocks());
afterAll(() => core.close());

describe("CRM REST adapter", () => {
  it("validates and forwards one atomic guarded CRM inverse", async () => {
    signIn();
    const undo = {
      workspaceId: id,
      expectedState: "a".repeat(64),
      steps: [
        {
          method: "PUT",
          scope: "project",
          entityId: id,
          contactId: other,
          roles: ["tech"],
        },
      ],
    };
    const call = vi
      .spyOn(core, "undoCrm")
      .mockResolvedValue({ restored: true });
    expect(
      (await send("/api/crm/undo", "POST", { ...undo, expectedState: "bad" }))
        .status,
    ).toBe(400);
    expect(call).not.toHaveBeenCalled();
    expect((await send("/api/crm/undo", "POST", undo)).status).toBe(200);
    expect(call).toHaveBeenCalledExactlyOnceWith(person, undo);
  });
  it("requires a session and preserves core denials for CRM Undo", async () => {
    const undo = { workspaceId: id, expectedState: "a".repeat(64), steps: [] };
    vi.spyOn(core, "getSession").mockResolvedValue({
      response: null,
      headers: new Headers(),
    });
    const call = vi.spyOn(core, "undoCrm");
    expect((await send("/api/crm/undo", "POST", undo)).status).toBe(401);
    expect(call).not.toHaveBeenCalled();
    signIn();
    call.mockRejectedValue(new CoreError("forbidden", 403));
    expect((await send("/api/crm/undo", "POST", undo)).status).toBe(403);
  });

  it("requires a session before any CRM read", async () => {
    vi.spyOn(core, "getSession").mockResolvedValue({
      response: null,
      headers: new Headers(),
    });
    const list = vi.spyOn(core, "listContacts");
    expect((await app.request(`/api/contacts?workspaceId=${id}`)).status).toBe(
      401,
    );
    expect(list).not.toHaveBeenCalled();
  });
  it("validates list queries and forwards typed filters with the session identity", async () => {
    signIn();
    const companies = vi.spyOn(core, "listCompanies").mockResolvedValue([]);
    const contacts = vi.spyOn(core, "listContacts").mockResolvedValue([]);
    expect((await app.request("/api/companies?workspaceId=bad")).status).toBe(
      400,
    );
    expect(
      (
        await app.request(
          `/api/companies?workspaceId=${id}&includeArchived=yes`,
        )
      ).status,
    ).toBe(400);
    expect(
      (await app.request(`/api/contacts?workspaceId=${id}&phone=1`)).status,
    ).toBe(400);
    expect(companies).not.toHaveBeenCalled();
    expect(contacts).not.toHaveBeenCalled();
    expect(
      (
        await app.request(
          `/api/companies?workspaceId=${id}&includeArchived=true`,
        )
      ).status,
    ).toBe(200);
    expect(companies).toHaveBeenCalledWith(person, id, {
      includeArchived: true,
    });
    expect(
      (
        await app.request(
          `/api/contacts?workspaceId=${id}&companyId=${other}&query=%20lee%20`,
        )
      ).status,
    ).toBe(200);
    expect(contacts).toHaveBeenCalledWith(person, id, {
      companyId: other,
      query: "lee",
    });
  });
  it("creates and edits records only from validated bodies", async () => {
    signIn();
    const create = vi.spyOn(core, "createContact").mockResolvedValue(contact);
    const invalid = await send(`/api/contacts?workspaceId=${id}`, "POST", {
      name: "Lee",
      email: "not-an-email",
    });
    expect(invalid.status).toBe(400);
    const extra = await send(`/api/contacts?workspaceId=${id}`, "POST", {
      name: "Lee",
      workspaceId: other,
    });
    expect(extra.status).toBe(400);
    expect(create).not.toHaveBeenCalled();
    const created = await send(`/api/contacts?workspaceId=${id}`, "POST", {
      name: " Lee ",
      email: "lee@example.com",
    });
    expect(created.status).toBe(201);
    expect(create).toHaveBeenCalledWith(person, id, {
      name: "Lee",
      email: "lee@example.com",
    });
    const update = vi
      .spyOn(core, "updateCompany")
      .mockRejectedValue(new CoreError("conflict", 409));
    const stale = await send(`/api/companies/${id}`, "PATCH", {
      version: 1,
      name: "New",
    });
    expect(stale.status).toBe(409);
    expect(await stale.json()).toEqual({ error: "conflict" });
    expect(update).toHaveBeenCalledWith(person, id, {
      version: 1,
      name: "New",
    });
    const company = vi
      .spyOn(core, "setContactCompany")
      .mockResolvedValue({ contact, dropped: 1, previousCompanyId: id });
    const moved = await send(`/api/contacts/${other}/company`, "PATCH", {
      version: 1,
      companyId: null,
    });
    expect(await moved.json()).toMatchObject({ dropped: 1 });
    expect(company).toHaveBeenCalledWith(person, other, {
      version: 1,
      companyId: null,
    });
  });
  it("archives on DELETE with the version from the query string", async () => {
    signIn();
    const archive = vi.spyOn(core, "updateContact").mockResolvedValue(contact);
    const archiveCompany = vi
      .spyOn(core, "updateCompany")
      .mockRejectedValue(new CoreError("forbidden", 403));
    expect((await send(`/api/contacts/${other}`, "DELETE")).status).toBe(400);
    expect(
      (await send(`/api/contacts/${other}?version=0`, "DELETE")).status,
    ).toBe(400);
    expect(archive).not.toHaveBeenCalled();
    expect(
      (await send(`/api/contacts/${other}?version=3`, "DELETE")).status,
    ).toBe(200);
    expect(archive).toHaveBeenCalledWith(person, other, {
      version: 3,
      archived: true,
    });
    expect(
      (await send(`/api/companies/${id}?version=2`, "DELETE")).status,
    ).toBe(403);
    expect(archiveCompany).toHaveBeenCalledWith(person, id, {
      version: 2,
      archived: true,
    });
  });
  it("routes link reads, role sets and unlinks to the matching scope", async () => {
    signIn();
    const list = vi.spyOn(core, "listContactLinks").mockResolvedValue([]);
    const set = vi.spyOn(core, "setContactRoles").mockResolvedValue({
      link: {
        scope: "project",
        entityId: id,
        contactId: other,
        roles: ["signoff"],
        contact,
      },
      replaced: [],
      addedProjectStakeholder: false,
      previousRoles: null,
    });
    const unlink = vi
      .spyOn(core, "unlinkContact")
      .mockResolvedValue({ cascadedTaskLinks: 2 });
    for (const [path, scope] of [
      ["companies", "company"],
      ["projects", "project"],
      ["tasks", "task"],
    ] as const) {
      expect((await app.request(`/api/${path}/${id}/contacts`)).status).toBe(
        200,
      );
      expect(list).toHaveBeenLastCalledWith(person, scope, id);
    }
    expect(
      (
        await send(`/api/projects/${id}/contacts/${other}`, "PUT", {
          roles: ["pilot"],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await send(`/api/projects/${id}/contacts/${other}`, "PUT", {
          roles: ["tech", "tech"],
        })
      ).status,
    ).toBe(400);
    expect(
      (
        await send(`/api/projects/${id}/contacts/bad`, "PUT", {
          roles: [],
        })
      ).status,
    ).toBe(400);
    expect(set).not.toHaveBeenCalled();
    const put = await send(`/api/projects/${id}/contacts/${other}`, "PUT", {
      roles: ["signoff"],
    });
    expect(put.status).toBe(200);
    expect(set).toHaveBeenCalledWith(person, "project", id, other, {
      roles: ["signoff"],
    });
    const removed = await send(
      `/api/projects/${id}/contacts/${other}`,
      "DELETE",
    );
    expect(await removed.json()).toEqual({ cascadedTaskLinks: 2 });
    expect(unlink).toHaveBeenCalledWith(person, "project", id, other);
    set.mockRejectedValue(new CoreError("invalid_input", 400));
    const scoped = await send(`/api/companies/${id}/contacts/${other}`, "PUT", {
      roles: ["chair"],
    });
    expect(scoped.status).toBe(400);
    expect(set).toHaveBeenLastCalledWith(person, "company", id, other, {
      roles: ["chair"],
    });
  });
  it("serves the admin audit and the bounded CRM search", async () => {
    signIn();
    const audit = vi.spyOn(core, "auditCrm").mockResolvedValue([]);
    const search = vi
      .spyOn(core, "searchCrm")
      .mockResolvedValue({ companies: [], contacts: [] });
    expect((await app.request(`/api/workspaces/${id}/crm/audit`)).status).toBe(
      200,
    );
    expect(audit).toHaveBeenCalledWith(person, id);
    expect(
      (
        await app.request(
          `/api/workspaces/${id}/crm/search?q=${"x".repeat(201)}`,
        )
      ).status,
    ).toBe(400);
    expect(
      (await app.request(`/api/workspaces/${id}/crm/search?q=north&x=1`))
        .status,
    ).toBe(400);
    expect(
      (await app.request(`/api/workspaces/${id}/crm/search?q=%20North%20`))
        .status,
    ).toBe(200);
    expect(search).toHaveBeenCalledWith(person, id, "North");
  });
});

describe("CRM MCP tools", () => {
  const principal = {
    kind: "agent" as const,
    tokenId: id,
    memberId: id,
    workspaceId: id,
    scopes: ["tasks:read" as const],
  };
  const call = (body: unknown) =>
    app.request("/mcp", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json, text/event-stream",
        Authorization: "Bearer taff_token",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, ...(body as object) }),
    });
  async function json(response: Response) {
    const text = await response.text();
    const raw = response.headers.get("content-type")?.includes("event-stream")
      ? text
          .split("\n")
          .find((line) => line.startsWith("data:"))
          ?.slice(5)
      : text;
    return JSON.parse(raw ?? "{}") as {
      result?: {
        isError?: boolean;
        tools?: { name: string }[];
        content?: { text: string }[];
      };
    };
  }
  it("lists the three read-only CRM tools and forwards token identity", async () => {
    vi.spyOn(core, "authenticateAgentToken").mockResolvedValue(principal);
    vi.spyOn(core, "resolveAgentWorkspace").mockResolvedValue(principal);
    vi.spyOn(core, "recordMcpCall").mockResolvedValue();
    const listed = await json(await call({ method: "tools/list" }));
    const names = listed.result?.tools?.map((tool) => tool.name) ?? [];
    expect(names).toEqual(
      expect.arrayContaining([
        "companies.list",
        "contacts.list",
        "contacts.get",
      ]),
    );
    expect(names.some((name) => /^(companies|contacts)\./.test(name))).toBe(
      true,
    );
    expect(
      names.filter((name) => /^(companies|contacts)\./.test(name)).sort(),
    ).toEqual(["companies.list", "contacts.get", "contacts.list"]);
    const companies = vi.spyOn(core, "listCompanies").mockResolvedValue([]);
    const contacts = vi
      .spyOn(core, "listContacts")
      .mockResolvedValue([contact]);
    const detail = vi
      .spyOn(core, "getContactDetail")
      .mockRejectedValue(new CoreError("forbidden", 403));
    await call({
      method: "tools/call",
      params: { name: "companies.list", arguments: { includeArchived: true } },
    });
    expect(companies).toHaveBeenCalledWith(principal, id, {
      includeArchived: true,
    });
    const listedContacts = await json(
      await call({
        method: "tools/call",
        params: { name: "contacts.list", arguments: { query: "lee" } },
      }),
    );
    expect(contacts).toHaveBeenCalledWith(principal, id, { query: "lee" });
    expect(
      JSON.parse(listedContacts.result?.content?.[0].text ?? "null"),
    ).toEqual([contact]);
    const denied = await json(
      await call({
        method: "tools/call",
        params: { name: "contacts.get", arguments: { contactId: other } },
      }),
    );
    expect(detail).toHaveBeenCalledWith(principal, other);
    expect(denied.result?.isError).toBe(true);
    const invalid = await json(
      await call({
        method: "tools/call",
        params: { name: "contacts.get", arguments: { contactId: "bad" } },
      }),
    );
    expect(invalid.result?.isError).toBe(true);
    expect(detail).toHaveBeenCalledTimes(1);
  });
});
