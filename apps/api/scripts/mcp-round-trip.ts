// The MCP round trip shared by `pnpm mcp:smoke` (local API, core as the
// person) and the R1 release checklist (any origin, HTTP as the person). It
// drives every tool with the official v2 client, observes the rate limit and
// checks that a revoked token is refused. Callers supply the person's side
// (`McpHumanActions`) and never pass the token to `check` or a log line.
import {
  Client,
  StreamableHTTPClientTransport,
} from "@modelcontextprotocol/client";
import {
  type AgentPermissionInput,
  type AgentProfile,
  type Company,
  type Contact,
  type CreateAgentToken,
  calendarViewDataSchema,
  companyListSchema,
  contactDetailSchema,
  contactListSchema,
  type DecideGrant,
  dependencySchema,
  grantSchema,
  type McpCall,
  quickAddResultSchema,
  type ReviewRun,
  type ReviewWorkspace,
  type Run,
  runDetailSchema,
  runSchema,
  searchResultSchema,
  taskCalendarSchema,
  taskPlanResultSchema,
  taskSchema,
  timelineSchema,
} from "@taff/schemas";

/** Every tool the MCP server lists, sorted. */
export const MCP_TOOLS = [
  "calendar.list",
  "calendar.schedule",
  "calendar.set",
  "companies.list",
  "contacts.get",
  "contacts.list",
  "dependencies.add",
  "dependencies.remove",
  "files.attach",
  "grants.request",
  "inbox.request_review",
  "projects.list",
  "quickadd.parse",
  "runs.control",
  "runs.event",
  "runs.get",
  "runs.start",
  "runs.submit",
  "search.query",
  "tasks.comments.add",
  "tasks.comments.list",
  "tasks.create",
  "tasks.edit",
  "tasks.list",
  "tasks.plan",
  "tasks.update",
  "timeline.get",
] as const;

/** What the person does during the round trip, through core or HTTP. */
export type McpHumanActions = {
  decideGrant(grantId: string, input: DecideGrant): Promise<unknown>;
  getAgentProfile(agentId: string): Promise<Pick<AgentProfile, "permissions">>;
  setAgentPermission(
    agentId: string,
    input: AgentPermissionInput,
  ): Promise<unknown>;
  reviewRun(runId: string, input: ReviewRun): Promise<Run>;
  getReview(
    taskId: string,
  ): Promise<Pick<ReviewWorkspace, "run" | "artifacts">>;
  createCompany(input: {
    name: string;
  }): Promise<Pick<Company, "id" | "version">>;
  createContact(input: {
    name: string;
    companyId: string;
    phone: string;
    email: string;
  }): Promise<Pick<Contact, "id" | "version">>;
  archiveContact(contact: Pick<Contact, "id" | "version">): Promise<unknown>;
  archiveCompany(company: Pick<Company, "id" | "version">): Promise<unknown>;
  createAgentToken(
    input: CreateAgentToken,
  ): Promise<{ id: string; token: string }>;
  revokeAgentToken(tokenId: string): Promise<unknown>;
  listMcpCalls(): Promise<Pick<McpCall, "tool" | "status">[]>;
};

export type McpRoundTripOptions = {
  /** The `/mcp` URL. */
  endpoint: URL;
  /** A fresh token for `agentId` with every scope the round trip needs. */
  token: string;
  agentId: string;
  workspace: { id: string; memberId: string };
  project: { id: string; name: string };
  /** Requests per token per minute before the server answers 429. */
  rateLimit: number;
  human: McpHumanActions;
  /** Records one named result; must not print secrets. */
  check(name: string, condition: boolean, detail?: unknown): void;
  /** Revokes `token` once its rate-limit window is exhausted. */
  revokeToken(): Promise<void>;
  /** Called right after `tasks.create`, e.g. to watch the UI update. */
  onTaskCreated?(task: { id: string; title: string }): Promise<void>;
  /** Skips the rate-limit probe and records why. */
  skipRateLimit?: string;
  clientName?: string;
};

export const ROUND_TRIP_SCOPES = [
  "tasks:read",
  "tasks:write",
  "calendar:write",
  "inbox:review",
  "files:write",
] as const;

/** Parses the JSON text block of a tool result, or null without one. */
export function toolJson(result: {
  content: { type: string; text?: string }[];
}) {
  const block = result.content.find((item) => item.type === "text");
  return block?.text
    ? (JSON.parse(block.text) as Record<string, unknown>)
    : null;
}

export async function runMcpRoundTrip(options: McpRoundTripOptions) {
  const {
    endpoint: apiUrl,
    agentId,
    workspace,
    project,
    human,
    check,
    rateLimit: limit,
  } = options;
  const text = toolJson;
  const clientInfo = {
    name: options.clientName ?? "taff-smoke",
    version: "0.1.0",
  };
  const client = new Client(clientInfo);
  const transport = new StreamableHTTPClientTransport(apiUrl, {
    authProvider: { token: async () => options.token },
  });
  await client.connect(transport);
  const tools = (await client.listTools()).tools
    .map((tool) => tool.name)
    .sort();
  check(
    "lists every task, calendar, timeline, project, search, draft, run, grant, file and CRM tool",
    JSON.stringify(tools) === JSON.stringify(MCP_TOOLS),
    tools,
  );
  const calendarStart = new Date(Date.now() + 3_600_000).toISOString();
  const calendarEnd = new Date(Date.now() + 7_200_000).toISOString();
  const initialCalendar = {
    startAt: calendarStart,
    endAt: calendarEnd,
    timeZone: "Asia/Singapore",
    rrule: "FREQ=DAILY;COUNT=3",
  };
  const calendarRange = {
    from: new Date(Date.now() - 3_600_000).toISOString(),
    to: new Date(Date.now() + 5 * 86_400_000).toISOString(),
  };
  const created = text(
    await client.callTool({
      name: "tasks.create",
      arguments: {
        title: `Smoke task ${Date.now()}`,
        ownerId: workspace.memberId,
        description: "M6 MCP smoke",
        priority: 2,
        projectId: project.id,
        labels: ["smoke"],
        calendar: initialCalendar,
      },
    }),
  );
  check(
    "tasks.create returns a task worked by the agent",
    created?.workerId === agentId,
    created,
  );
  const taskId = String(created?.id);
  await options.onTaskCreated?.({ id: taskId, title: String(created?.title) });
  const initialView = calendarViewDataSchema.parse(
    text(
      await client.callTool({
        name: "calendar.list",
        arguments: calendarRange,
      }),
    ),
  );
  const initialOccurrences = initialView.occurrences.filter(
    (item) => item.task.id === taskId,
  );
  check(
    "tasks.create atomically stores a recurring calendar interval in the token workspace",
    initialOccurrences.length === 3 &&
      initialOccurrences.every(
        (item) =>
          item.task.workspaceId === workspace.id &&
          item.isAgent &&
          item.canSchedule,
      ) &&
      initialOccurrences[0].startAt === calendarStart,
    initialOccurrences,
  );
  const edited = taskSchema.parse(
    text(
      await client.callTool({
        name: "tasks.edit",
        arguments: {
          taskId,
          version: created?.version,
          description: "M5 versioned edit",
          labels: ["smoke", "edited"],
        },
      }),
    ),
  );
  check(
    "tasks.edit preserves rich fields and increments the task version",
    edited.version === Number(created?.version) + 1 &&
      edited.projectId === project.id &&
      edited.labels.includes("edited"),
  );
  const projectList = text(
    await client.callTool({ name: "projects.list", arguments: {} }),
  );
  check(
    "projects.list reads the token workspace",
    Array.isArray(projectList) &&
      projectList.some((item) => item.id === project.id),
  );
  const parsed = quickAddResultSchema.parse(
    text(
      await client.callTool({
        name: "quickadd.parse",
        arguments: {
          text: `Quick smoke tomorrow 15:30 !high #${project.name} +smoke`,
        },
      }),
    ),
  );
  check(
    "quickadd.parse returns editable timezone-aware fields without creating work",
    parsed.title === "Quick smoke" &&
      parsed.priority === 2 &&
      parsed.projectId === project.id &&
      parsed.labels.includes("smoke") &&
      parsed.dueTime === "15:30" &&
      !!parsed.dueAt,
  );
  const commentBody = `Searchable MCP comment ${Date.now()}`;
  const comment = text(
    await client.callTool({
      name: "tasks.comments.add",
      arguments: { taskId, body: commentBody },
    }),
  );
  check(
    "tasks.comments.add stores real agent discussion",
    comment?.body === commentBody && comment?.authorId === agentId,
  );
  const comments = text(
    await client.callTool({
      name: "tasks.comments.list",
      arguments: { taskId },
    }),
  );
  check(
    "tasks.comments.list reads the authorized discussion",
    Array.isArray(comments) && comments.some((item) => item.id === comment?.id),
  );
  const matches = text(
    await client.callTool({
      name: "search.query",
      arguments: { query: commentBody, scope: "all", types: ["comment"] },
    }),
  );
  check(
    "search.query finds the comment in the token workspace",
    Array.isArray(matches) &&
      matches.some((item) => {
        const match = searchResultSchema.parse(item);
        return match.id === comment?.id && match.workspaceId === workspace.id;
      }),
  );
  const started = text(
    await client.callTool({
      name: "tasks.update",
      arguments: { taskId, status: "in_progress" },
    }),
  );
  check(
    "tasks.update starts the task",
    started?.status === "in_progress",
    started,
  );
  const dueAt = new Date(Date.now() + 86_400_000).toISOString();
  const scheduled = text(
    await client.callTool({
      name: "calendar.schedule",
      arguments: { taskId, dueAt },
    }),
  );
  check(
    "calendar.schedule sets the due time",
    typeof scheduled?.dueAt === "string",
    scheduled,
  );
  const interval = taskCalendarSchema.parse(
    text(
      await client.callTool({
        name: "calendar.set",
        arguments: {
          taskId,
          version: scheduled?.version,
          schedule: {
            ...initialCalendar,
            startAt: new Date(
              Date.parse(calendarStart) + 1_800_000,
            ).toISOString(),
            endAt: new Date(Date.parse(calendarEnd) + 1_800_000).toISOString(),
          },
        },
      }),
    ),
  );
  check(
    "calendar.set moves the whole series without changing its deadline",
    interval.task.version === Number(scheduled?.version) + 1 &&
      interval.task.dueAt === scheduled?.dueAt &&
      interval.schedule?.startAt ===
        new Date(Date.parse(calendarStart) + 1_800_000).toISOString(),
    interval,
  );
  const movedView = calendarViewDataSchema.parse(
    text(
      await client.callTool({
        name: "calendar.list",
        arguments: calendarRange,
      }),
    ),
  );
  check(
    "calendar.list expands the updated series with unique occurrence IDs",
    movedView.occurrences.filter((item) => item.task.id === taskId).length ===
      3 &&
      new Set(movedView.occurrences.map((item) => item.id)).size ===
        movedView.occurrences.length,
  );
  const cleared = taskCalendarSchema.parse(
    text(
      await client.callTool({
        name: "calendar.set",
        arguments: { taskId, version: interval.task.version, schedule: null },
      }),
    ),
  );
  check(
    "calendar.set clears only the interval and advances the shared task version",
    cleared.schedule === null &&
      cleared.task.dueAt === scheduled?.dueAt &&
      cleared.task.version === interval.task.version + 1,
  );
  // Timeline (ADR 0015): plan both smoke tasks, link them, refuse a cycle.
  const civil = (days: number) =>
    new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
  const planned = taskPlanResultSchema.parse(
    text(
      await client.callTool({
        name: "tasks.plan",
        arguments: { taskId, startDate: civil(1), durationDays: 2 },
      }),
    ),
  );
  check(
    "tasks.plan stores a new plan and moves the deadline to its last day",
    planned.plans[0]?.taskId === taskId &&
      planned.plans[0]?.version === 1 &&
      planned.tasks[0]?.id === taskId,
    planned,
  );
  const follower = taskSchema.parse(
    text(
      await client.callTool({
        name: "tasks.create",
        arguments: {
          title: `Smoke follow-up ${Date.now()}`,
          ownerId: workspace.memberId,
          projectId: project.id,
        },
      }),
    ),
  );
  await client.callTool({
    name: "tasks.plan",
    arguments: { taskId: follower.id, startDate: civil(3), durationDays: 1 },
  });
  const link = dependencySchema.parse(
    text(
      await client.callTool({
        name: "dependencies.add",
        arguments: { predecessorTaskId: taskId, successorTaskId: follower.id },
      }),
    ),
  );
  check(
    "dependencies.add links two tasks in the token workspace",
    link.predecessorTaskId === taskId &&
      link.successorTaskId === follower.id &&
      link.workspaceId === workspace.id,
  );
  const cycle = await client.callTool({
    name: "dependencies.add",
    arguments: { predecessorTaskId: follower.id, successorTaskId: taskId },
  });
  check(
    "dependencies.add refuses a cycle",
    cycle.isError === true &&
      (cycle.content as { text?: string }[])[0]?.text === "conflict",
    cycle,
  );
  const plan = timelineSchema.parse(
    text(
      await client.callTool({
        name: "timeline.get",
        arguments: { projectId: project.id },
      }),
    ),
  );
  check(
    "timeline.get reads spans and links without finance",
    plan.items.some((item) => item.id === taskId && item.planned) &&
      plan.items.some((item) => item.id === follower.id) &&
      plan.dependencies.some((dep) => dep.id === link.id && !dep.conflict) &&
      plan.risk.finance === null,
    plan,
  );
  const unlinked = dependencySchema.parse(
    text(
      await client.callTool({
        name: "dependencies.remove",
        arguments: { dependencyId: link.id },
      }),
    ),
  );
  check(
    "dependencies.remove returns the removed link",
    unlinked.id === link.id,
  );
  let run = runSchema.parse(
    text(await client.callTool({ name: "runs.start", arguments: { taskId } })),
  );
  check("runs.start creates real running work", run.status === "running");
  const detail = async () =>
    runDetailSchema.parse(
      text(
        await client.callTool({
          name: "runs.get",
          arguments: { runId: run.id },
        }),
      ),
    );
  run = runSchema.parse(
    text(
      await client.callTool({
        name: "runs.control",
        arguments: { runId: run.id, version: run.version, action: "pause" },
      }),
    ),
  );
  check("runs.control pauses", run.status === "paused");
  run = runSchema.parse(
    text(
      await client.callTool({
        name: "runs.control",
        arguments: { runId: run.id, version: run.version, action: "resume" },
      }),
    ),
  );
  const grant = grantSchema.parse(
    text(
      await client.callTool({
        name: "grants.request",
        arguments: {
          agentId,
          taskId,
          runId: run.id,
          capability: "repo.read",
          reason: "MCP smoke verifies scoped grants",
        },
      }),
    ),
  );
  check(
    "grants.request creates a pending human decision",
    grant.status === "pending",
  );
  await human.decideGrant(grant.id, {
    decision: "allow",
    expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  });
  run = (await detail()).run;
  if (run.status === "paused")
    run = runSchema.parse(
      text(
        await client.callTool({
          name: "runs.control",
          arguments: { runId: run.id, version: run.version, action: "resume" },
        }),
      ),
    );
  const profile = await human.getAgentProfile(agentId);
  if (
    profile.permissions.find(({ capability }) => capability === "files.attach")
      ?.decision === "ask"
  ) {
    const attachmentGrant = grantSchema.parse(
      text(
        await client.callTool({
          name: "grants.request",
          arguments: {
            agentId,
            taskId,
            runId: run.id,
            capability: "files.attach",
            reason: "Attach this smoke run's actual MCP discovery evidence",
          },
        }),
      ),
    );
    check(
      "files.attach ask policy requires its own scoped human grant",
      attachmentGrant.status === "pending" &&
        attachmentGrant.taskId === taskId &&
        attachmentGrant.runId === run.id,
    );
    await human.decideGrant(attachmentGrant.id, {
      decision: "allow",
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    });
    run = (await detail()).run;
    if (run.status === "paused")
      run = runSchema.parse(
        text(
          await client.callTool({
            name: "runs.control",
            arguments: {
              runId: run.id,
              version: run.version,
              action: "resume",
            },
          }),
        ),
      );
  }
  const measuredStart = performance.now();
  const discovery = await client.listTools();
  await client.callTool({
    name: "runs.event",
    arguments: {
      runId: run.id,
      version: run.version,
      kind: "test",
      title: "MCP tool discovery",
      text: `Discovered ${discovery.tools.length} tools`,
      testStatus: "passed",
      durationMs: Math.round(performance.now() - measuredStart),
      costMicros: 0,
    },
  });
  run = (await detail()).run;
  const attached = await client.callTool({
    name: "files.attach",
    arguments: {
      runId: run.id,
      version: run.version,
      name: "mcp-smoke.txt",
      mimeType: "text/plain",
      content: `Official client discovered:\n${tools.join("\n")}`,
      diff: "+ MCP discovery verified",
      sourceUrl: apiUrl.href,
    },
  });
  check("files.attach stores actual content", !attached.isError);
  run = (await detail()).run;
  run = runSchema.parse(
    text(
      await client.callTool({
        name: "runs.submit",
        arguments: {
          runId: run.id,
          version: run.version,
          summary: "MCP discovery verified",
        },
      }),
    ),
  );
  check("runs.submit waits for a person", run.status === "needs_review");
  run = await human.reviewRun(run.id, {
    version: run.version,
    decision: "request_changes",
    checks: {
      matchesDescription: false,
      verifiable: false,
      withinPermissions: false,
    },
    comment: "Include a source event before final approval",
    items: [],
  });
  run = runSchema.parse(
    text(
      await client.callTool({
        name: "runs.control",
        arguments: { runId: run.id, version: run.version, action: "resume" },
      }),
    ),
  );
  await client.callTool({
    name: "runs.event",
    arguments: {
      runId: run.id,
      version: run.version,
      kind: "source",
      title: "Local MCP endpoint",
      sourceUrl: apiUrl.href,
    },
  });
  const review = text(
    await client.callTool({
      name: "inbox.request_review",
      arguments: { taskId },
    }),
  );
  check(
    "inbox.request_review hands over for review",
    review?.status === "needs_review",
    review,
  );
  const workspaceReview = await human.getReview(taskId);
  const approved = await human.reviewRun(workspaceReview.run.id, {
    version: workspaceReview.run.version,
    decision: "approve",
    checks: {
      matchesDescription: true,
      verifiable: true,
      withinPermissions: true,
    },
    comment: "",
    items: workspaceReview.artifacts.map((artifact) => ({
      artifactId: artifact.id,
      decision: "approve",
      comment: "",
    })),
  });
  check("human review completes the run", approved.status === "completed");
  const listed = text(
    await client.callTool({
      name: "tasks.list",
      arguments: { status: "done" },
    }),
  ) as unknown as { id: string }[] | null;
  check(
    "tasks.list filters by status",
    Array.isArray(listed) && listed.some((task) => task.id === taskId),
  );
  const denied = await client.callTool({
    name: "tasks.update",
    arguments: { taskId, workerId: workspace.memberId },
  });
  check(
    "reassigning away from the agent is denied",
    denied.isError === true,
    denied,
  );
  // CRM reads need tasks:read plus the crm.read capability a person allows;
  // phone and email stay hidden without crm.contact_details.
  const crmCompany = await human.createCompany({
    name: `Smoke Co ${Date.now()}`,
  });
  const crmContact = await human.createContact({
    name: `Smoke Contact ${Date.now()}`,
    companyId: crmCompany.id,
    phone: "+852 0000 0000",
    email: "smoke@example.com",
  });
  const priorCrm = (await human.getAgentProfile(agentId)).permissions.filter(
    ({ capability }) =>
      ["crm.read", "crm.contact_details"].includes(capability),
  );
  const deniedCrm = await client.callTool({
    name: "contacts.list",
    arguments: {},
  });
  const crmGranted = priorCrm.some(
    ({ capability, decision }) =>
      capability === "crm.read" && decision === "allow",
  );
  check(
    "contacts.list is refused until a person allows crm.read",
    crmGranted || deniedCrm.isError === true,
    deniedCrm,
  );
  await human.setAgentPermission(agentId, {
    capability: "crm.read",
    decision: "allow",
  });
  await human.setAgentPermission(agentId, {
    capability: "crm.contact_details",
    decision: "deny",
  });
  try {
    const crmCompanies = companyListSchema.parse(
      text(await client.callTool({ name: "companies.list", arguments: {} })),
    );
    check(
      "companies.list reads the token workspace's companies",
      crmCompanies.some((company) => company.id === crmCompany.id),
    );
    const crmContacts = contactListSchema.parse(
      text(
        await client.callTool({
          name: "contacts.list",
          arguments: { companyId: crmCompany.id },
        }),
      ),
    );
    check(
      "contacts.list hides phone and email without crm.contact_details",
      crmContacts.length === 1 &&
        crmContacts[0].id === crmContact.id &&
        crmContacts[0].phone === null &&
        crmContacts[0].email === null,
      crmContacts,
    );
    const crmDetail = contactDetailSchema.parse(
      text(
        await client.callTool({
          name: "contacts.get",
          arguments: { contactId: crmContact.id },
        }),
      ),
    );
    check(
      "contacts.get reads one contact with its company and no details",
      crmDetail.contact.id === crmContact.id &&
        crmDetail.company?.id === crmCompany.id &&
        crmDetail.contact.phone === null &&
        crmDetail.contact.email === null,
      crmDetail,
    );
  } finally {
    // Leave the agent's CRM permissions as they were.
    for (const capability of ["crm.read", "crm.contact_details"] as const)
      await human.setAgentPermission(agentId, {
        capability,
        decision:
          priorCrm.find((item) => item.capability === capability)?.decision ??
          (capability === "crm.read" ? "ask" : "deny"),
      });
    await human.archiveContact(crmContact);
    await human.archiveCompany(crmCompany);
  }
  if (options.skipRateLimit) {
    check(`rate limit probe skipped: ${options.skipRateLimit}`, true);
  } else {
    let limited = false;
    for (let i = 0; i < limit + 2 && !limited; i++) {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${options.token}`,
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({ jsonrpc: "2.0", id: i, method: "tools/list" }),
      });
      limited = response.status === 429;
    }
    check(`rate limit of ${limit}/minute triggers 429`, limited);
  }
  await client.close();
  await options.revokeToken();
  // The limiter runs before authentication, so the exhausted token above
  // keeps answering 429 for the rest of its window; revoke a fresh one.
  const second = await human.createAgentToken({
    workspaceId: workspace.id,
    memberId: agentId,
    name: `smoke revoked ${new Date().toISOString()}`,
    scopes: ["tasks:read"],
  });
  await human.revokeAgentToken(second.id);
  const revokedClient = new Client(clientInfo);
  let unauthorized = false;
  try {
    await revokedClient.connect(
      new StreamableHTTPClientTransport(apiUrl, {
        authProvider: { token: async () => second.token },
      }),
    );
  } catch (error) {
    unauthorized = /401|Unauthorized/i.test(String(error));
  }
  check("revoked token is rejected", unauthorized);
  const calls = await human.listMcpCalls();
  check(
    "calls are logged with method and tool",
    calls.some((call) => call.tool === "tasks.create" && call.status === "ok"),
  );
  if (!options.skipRateLimit)
    check(
      "rate-limited calls are logged",
      calls.some((call) => call.status === "rate_limited"),
    );
  return { taskId, followerId: follower.id };
}
