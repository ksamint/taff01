import {
  agentPermissions,
  agentProfiles,
  grants,
  inboxItems,
  members,
  projects,
  reviewChecks,
  reviewComments,
  reviewItems,
  runArtifacts,
  runEvents,
  runs,
  type Transaction,
  taskCalendar,
  taskComments,
  tasks,
  user,
  workspaces,
} from "@taff/db";
import {
  agentPermissionInputSchema,
  appendRunEventSchema,
  attachRunArtifactSchema,
  calendarCivilTime,
  calendarScheduleInputSchema,
  calendarWallToInstant,
  createTaskSchema,
  reviewChecksSchema,
  taskCommentInputSchema,
} from "@taff/schemas";
import {
  type PrototypeOrg,
  type PrototypeTask,
  prototypeAgents,
  prototypeId,
  prototypeMeetingDescription,
  prototypeMeetings,
  prototypeOrgs,
  prototypePeople,
  prototypeTasks,
} from "@taff/schemas/prototype-data";
import { eq, sql } from "drizzle-orm";
import { normalizeCalendarSchedule } from "./calendar-recurrence";
import { type Actor, can } from "./permissions";

type Person = typeof user.$inferSelect;
const sample =
  "原型示例資料；未執行外部工具、測試、部署或真實訪談。 / Prototype sample data; no external tools, tests, deployments, or real interviews were executed.";
const stepTitles = [
  "讀取任務與上下文",
  "整理資料與方案",
  "準備交付物",
  "提交審核",
];
const evidence: Record<string, { name: string; text: string; diff?: string }> =
  {
    "nw:141": {
      name: "checkout-teardown.md",
      text: "# 競品結賬流程報告\n\n## 示例發現\n- 6 家中有 4 家在支付失敗後保留購物車與地址。\n- 平均 3.2 步，我們目前是 5 步。\n- 建議先合併地址與配送方式選擇。\n\n## 原型中的來源清單（示例，並非已取得的證據）\n- 6 款 App 實測錄屏\n- Baymard 結賬研究 2025\n- App Store 評論 212 條",
    },
    "nw:142": {
      name: "rollback-runbook-v2.4.md",
      text: "# v2.4 回滾預案\n\n- [x] 示例：資料庫回退腳本\n- [x] 示例：功能開關關閉順序\n- [x] 原型演練記錄：11 分鐘恢復（本系統未實際執行）\n- [ ] 生產環境演練（未執行）\n\n## 恢復驗證\n確認訂單狀態、支付重試與告警，再由負責人審核。",
    },
    "nw:135": {
      name: "coupon-tests.md",
      text: "# 優惠券 API 測試方案\n\n原型中的示例結果：24 個測試；覆蓋率 61% → 88%；示例 PR #471。這不是外部 PR、執行結果或覆蓋率驗證。\n\n覆蓋優惠券疊加、過期邊界與重复兌換。",
      diff: "--- coupon-test-plan.md\n+++ coupon-test-plan.md\n@@\n+ 疊加與過期邊界案例\n+ 重複兌換案例",
    },
    "nw:133": {
      name: "interview-synthesis.md",
      text: "# 用戶訪談綜述\n\n原型中的示例：8 場訪談中有 6 位提到重複填寫地址。\n\n建議保留支付失敗前的地址輸入，並在再次支付時重用。未包含真實訪談錄音或個人資料。",
    },
    "qs:22": {
      name: "client-interviews.md",
      text: "# 客戶訪談要點\n\n原型示例：3 位客戶希望首頁直接展示案例；2 位擔心加載速度；整理了 14 段原話。\n\n來源標記：4 場示例客戶訪談；不包含真實訪談記錄。",
    },
    "qs:20": {
      name: "competitor-sites.md",
      text: "# 競品官網清單\n\n原型示例：收集 12 個同類工作室官網，按案例呈現、導覽和載入體驗分類。未進行外部抓取。",
    },
  };
const blocker = "需要預發資料庫寫權限，當前權杖為只讀。";
const mention =
  "@林曉 失敗狀態的文案需要你確認，三個版本已放在 Figma 裡。（原型示例，未連接 Figma）";

/** Validated real fixtures; called inside the same seed lock/audited content transaction. */
export async function seedPrototype(
  tx: Transaction,
  people: readonly Person[],
  options: { seedDate?: string; timeZone: string },
): Promise<Record<PrototypeOrg, string>> {
  const today =
    options.seedDate ??
    calendarCivilTime(new Date(), options.timeZone).toISOString().slice(0, 10);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(today) ||
    new Date(`${today}T00:00:00Z`).toISOString().slice(0, 10) !== today
  )
    throw new Error("Invalid SEED_DATE");
  const day = (number: number) => {
    const date = new Date(`${today}T00:00:00Z`);
    date.setUTCDate(date.getUTCDate() + number - 8);
    return date.toISOString().slice(0, 10);
  };
  const at = (number: number, minutes: number) =>
    new Date(
      calendarWallToInstant(
        `${day(number)}T${Math.floor(minutes / 60)
          .toString()
          .padStart(2, "0")}:${(minutes % 60).toString().padStart(2, "0")}`,
        options.timeZone,
      ),
    );
  const output = { nw: "", qs: "", me: "" };
  for (const org of prototypeOrgs) {
    const workspaceId = prototypeId("workspace", org.key);
    const existing = (
      await tx.select().from(workspaces).where(eq(workspaces.id, workspaceId))
    )[0];
    // A stable identity never adopts or overwrites another workspace.
    if (existing && existing.seedKey !== org.seedKey)
      throw new Error("Prototype workspace identity conflict");
    await tx
      .insert(workspaces)
      .values({
        id: workspaceId,
        name: org.name["zh-HK"],
        key: org.key.toUpperCase(),
        seedKey: org.seedKey,
      })
      .onConflictDoUpdate({
        target: workspaces.id,
        set: { key: org.key.toUpperCase() },
        // Repeated seeds must not write (or audit) an unchanged key.
        setWhere: sql`${workspaces.key} <> ${org.key.toUpperCase()}`,
      });
    output[org.key] = workspaceId;
    const team = new Map<string, typeof members.$inferSelect>();
    for (const personKey of org.people) {
      const definition = prototypePeople.find((row) => row.key === personKey);
      const person = people.find((row) => row.email === definition?.email);
      if (!definition || !person) throw new Error("Prototype user missing");
      await tx
        .insert(members)
        .values({
          id: prototypeId("member", org.key, definition.number),
          workspaceId,
          userId: person.id,
          name: definition.name["zh-HK"],
          kind: "person",
          role: person.systemAdmin || personKey === "lx" ? "admin" : "member",
        })
        .onConflictDoNothing();
      const [member] = await tx
        .select()
        .from(members)
        .where(eq(members.userId, person.id))
        .then((rows) => rows.filter((row) => row.workspaceId === workspaceId));
      if (
        !member ||
        member.workspaceId !== workspaceId ||
        member.userId !== person.id
      )
        throw new Error("Prototype member identity conflict");
      team.set(personKey, member);
    }
    for (const agentKey of org.agents) {
      const definition = prototypeAgents.find((row) => row.key === agentKey);
      if (!definition) throw new Error("Prototype agent missing");
      const id = prototypeId("member", org.key, definition.number);
      await tx
        .insert(members)
        .values({
          id,
          workspaceId,
          name: definition.name["zh-HK"],
          kind: "agent",
          role: "member",
        })
        .onConflictDoNothing();
      const [member] = await tx
        .select()
        .from(members)
        .where(eq(members.id, id));
      if (
        !member ||
        member.workspaceId !== workspaceId ||
        member.kind !== "agent"
      )
        throw new Error("Prototype agent identity conflict");
      team.set(agentKey, member);
      const supervisor = team.get(org.supervisors[agentKey]);
      await tx
        .insert(agentProfiles)
        .values({
          id,
          workspaceId,
          supervisorId: supervisor?.id,
          reviewPolicy: "always_review",
        })
        .onConflictDoNothing();
      const permissions =
        agentKey === "ra"
          ? [
              ["tasks.read", "allow"],
              ["web.search", "allow"],
              ["files.attach", "ask"],
            ]
          : agentKey === "ca"
            ? [
                ["repo.read", "allow"],
                ["repo.pr", "allow"],
                ["repo.merge", "ask"],
                ["deploy.prod", "deny"],
              ]
            : [
                ["staging.read", "allow"],
                ["staging.write", "ask"],
                ["alerts", "allow"],
                ["deploy.prod", "deny"],
              ];
      for (const [index, entry] of permissions.entries()) {
        const body = agentPermissionInputSchema.parse({
          capability: entry[0],
          decision: entry[1],
        });
        await tx
          .insert(agentPermissions)
          .values({
            id: prototypeId(
              "permission",
              org.key,
              definition.number * 100 + index,
            ),
            workspaceId,
            agentId: id,
            ...body,
          })
          .onConflictDoNothing();
      }
      if (org.key === "nw" && agentKey === "ca" && supervisor) {
        if (
          !can(supervisor, "grant:decide", {
            workspaceId,
            agentId: id,
            supervisorId: supervisor.id,
          })
        )
          throw new Error("Prototype grant supervisor required");
        await tx
          .insert(grants)
          .values({
            id: prototypeId("grant", org.key, 9991),
            workspaceId,
            agentId: id,
            capability: "repo.pr",
            status: "allowed",
            reason: `示例限期授權；常規 PR 權限由 repo.pr 設定管理。\n${sample}`,
            decidedBy: supervisor.id,
            createdAt: at(2, 600),
            expiresAt: at(15, 600),
          })
          .onConflictDoNothing();
      }
    }
    const owner = team.get("lx");
    if (!owner) throw new Error("Prototype owner missing");
    const actor: Actor = owner;
    if (!can(actor, "project:manage", { workspaceId }))
      throw new Error("Prototype admin membership required");
    const projectId = prototypeId("project", org.key);
    await tx
      .insert(projects)
      .values({ id: projectId, workspaceId, name: org.project["zh-HK"] })
      .onConflictDoNothing();
    const insertCalendar = async (
      taskId: string,
      schedule: {
        day: number;
        start: number;
        duration: number;
        rrule?: string;
      },
    ) => {
      if (
        !can(actor, "task:schedule", { workspaceId, taskId, ownerId: owner.id })
      )
        throw new Error("Prototype schedule permission required");
      const input = normalizeCalendarSchedule(
        calendarScheduleInputSchema.parse({
          startAt: at(schedule.day, schedule.start).toISOString(),
          endAt: at(
            schedule.day,
            schedule.start + schedule.duration,
          ).toISOString(),
          timeZone: options.timeZone,
          rrule: schedule.rrule ?? null,
        }),
      );
      await tx
        .insert(taskCalendar)
        .values({
          taskId,
          workspaceId,
          startAt: new Date(input.startAt),
          endAt: new Date(input.endAt),
          timeZone: input.timeZone,
          rrule: input.rrule,
        })
        .onConflictDoNothing();
    };
    // Parents precede children; existing tasks keep their edits and workflow exactly.
    const definitions = prototypeTasks
      .filter((row) => row.org === org.key)
      .sort((a, b) => Number(!!a.parent) - Number(!!b.parent));
    for (const definition of definitions) {
      const id = prototypeId("task", org.key, definition.number);
      if (
        (await tx.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, id)))
          .length
      )
        continue;
      const taskOwner = team.get(definition.owner);
      const agent = definition.agent ? team.get(definition.agent) : undefined;
      if (!taskOwner || (definition.agent && !agent))
        throw new Error("Prototype assignment missing");
      if (!can(actor, "task:create", { workspaceId, toWorkerId: agent?.id }))
        throw new Error("Prototype create permission required");
      const input = createTaskSchema.parse({
        workspaceId,
        title: definition.title["zh-HK"],
        description: definition.description["zh-HK"],
        ownerId: taskOwner.id,
        workerId: agent?.id ?? null,
        priority: definition.priority,
        projectId,
        parentId: definition.parent
          ? prototypeId("task", org.key, definition.parent)
          : null,
        dueAt: at(definition.due, 1439).toISOString(),
      });
      const { dueAt, calendar: _, ...fields } = input;
      await tx.insert(tasks).values({
        id,
        ...fields,
        number: definition.number,
        status: definition.status,
        dueAt: dueAt ? new Date(dueAt) : null,
      });
      if (definition.calendar) await insertCalendar(id, definition.calendar);
      if (agent)
        await seedRun(tx, definition, workspaceId, taskOwner, agent, at);
      if (org.key === "nw" && definition.number === 139) {
        const body = taskCommentInputSchema.parse({ body: mention });
        await tx.insert(taskComments).values({
          id: prototypeId("comment", org.key, 139),
          workspaceId,
          taskId: id,
          authorId: taskOwner.id,
          ...body,
          createdAt: at(8, 641),
        });
        await tx.insert(inboxItems).values({
          id: prototypeId("inbox", org.key, 139),
          workspaceId,
          memberId: owner.id,
          taskId: id,
          kind: "mention",
          title: definition.title["zh-HK"],
          createdAt: at(8, 641),
        });
      }
    }
    for (const definition of prototypeMeetings.filter(
      (row) => row.org === org.key,
    )) {
      const id = prototypeId("task", org.key, definition.number);
      if (
        (await tx.select({ id: tasks.id }).from(tasks).where(eq(tasks.id, id)))
          .length
      )
        continue;
      const input = createTaskSchema.parse({
        workspaceId,
        title: definition.title["zh-HK"],
        description: prototypeMeetingDescription(definition)["zh-HK"],
        ownerId: team.get(definition.owner)?.id,
        projectId: null,
        dueAt: null,
        labels: ["meeting"],
      });
      const { dueAt: _, calendar: __, ...fields } = input;
      await tx.insert(tasks).values({
        id,
        ...fields,
        number: definition.number,
      });
      await insertCalendar(id, definition);
    }
  }
  return output;
}

async function seedRun(
  tx: Transaction,
  task: PrototypeTask,
  workspaceId: string,
  owner: typeof members.$inferSelect,
  agent: typeof members.$inferSelect,
  at: (day: number, minutes: number) => Date,
) {
  const runId = prototypeId("run", task.org, task.number);
  const taskId = prototypeId("task", task.org, task.number);
  const blocked = task.org === "nw" && task.number === 144;
  const completed = task.status === "done";
  const review = task.status === "needs_review";
  const minute =
    task.number === 141
      ? 552
      : task.number === 142
        ? 605
        : task.number === 144
          ? 615
          : task.org === "qs" && task.number === 22
            ? 630
            : 641;
  const text = evidence[`${task.org}:${task.number}`];
  const summary = `${sample}\n\n${text?.text ?? task.description["zh-HK"]}`;
  const comment =
    task.org === "nw" && task.number === 138
      ? "定位到原因：回調重試沒有冪等鍵，第二次回調被網關拒絕。正在補充冪等處理與測試。"
      : blocked
        ? blocker
        : (text?.text ?? task.description["zh-HK"]);
  const commentInput = taskCommentInputSchema.parse({
    body: `${comment}\n\n${sample}`,
  });
  await tx.insert(taskComments).values({
    id: prototypeId("comment", task.org, task.number),
    workspaceId,
    taskId,
    authorId: agent.id,
    ...commentInput,
    createdAt: at(completed ? task.due : 8, minute),
  });
  if (
    !can(owner, "run:start", {
      workspaceId,
      taskId,
      ownerId: owner.id,
      workerId: agent.id,
    })
  )
    throw new Error("Prototype run permission required");
  const started =
    task.org === "nw" && task.number === 141
      ? at(7, 963)
      : task.org === "nw" && task.number === 142
        ? at(8, 520)
        : task.org === "nw" && task.number === 144
          ? at(8, 580)
          : task.org === "nw" && task.number === 138
            ? at(8, 604)
            : task.org === "qs" && task.number === 22
              ? at(7, 1030)
              : task.org === "qs" && task.number === 23
                ? at(8, 592)
                : at(completed ? task.due - 1 : 8, 510);
  await tx.insert(runs).values({
    id: runId,
    workspaceId,
    taskId,
    agentId: agent.id,
    status: blocked
      ? "paused"
      : completed
        ? "completed"
        : review
          ? "needs_review"
          : "running",
    summary,
    startedAt: started,
    finishedAt: completed ? at(task.due, minute) : null,
    pausedBy: blocked ? "agent" : null,
  });
  for (let index = 0; index < (task.progress ?? 1); index++) {
    const body = appendRunEventSchema.parse({
      version: 1,
      kind: "step",
      title: stepTitles[index],
      text: index === (task.progress ?? 1) - 1 ? summary : sample,
    });
    const { version: _, ...fields } = body;
    await tx.insert(runEvents).values({
      id: prototypeId("event", task.org, task.number * 10 + index),
      workspaceId,
      runId,
      ...fields,
      createdAt: at(
        completed ? task.due : 8,
        minute - ((task.progress ?? 1) - 1 - index),
      ),
    });
  }
  if (text && (completed || review)) {
    const body = attachRunArtifactSchema.parse({
      version: 1,
      name: text.name,
      mimeType: "text/markdown",
      content: `${sample}\n\n${text.text}`,
      diff: text.diff ?? null,
    });
    const { version: _, ...fields } = body;
    const artifactId = prototypeId("artifact", task.org, task.number);
    await tx.insert(runArtifacts).values({
      id: artifactId,
      workspaceId,
      runId,
      ...fields,
      createdAt: at(completed ? task.due : 8, minute),
    });
    const checks = reviewChecksSchema.parse({
      matchesDescription: completed,
      verifiable: completed,
      withinPermissions: completed,
    });
    await tx.insert(reviewChecks).values({ id: runId, workspaceId, ...checks });
    if (completed) {
      if (
        !can(owner, "task:review", {
          workspaceId,
          ownerId: owner.id,
          workerId: agent.id,
          taskId,
          runId,
        })
      )
        throw new Error("Prototype reviewer permission required");
      await tx.insert(reviewItems).values({
        id: prototypeId("reviewItem", task.org, task.number),
        workspaceId,
        runId,
        artifactId,
        decision: "approve",
        reviewedBy: owner.id,
        createdAt: at(task.due, minute),
      });
      await tx.insert(reviewComments).values({
        id: prototypeId("comment", task.org, task.number),
        workspaceId,
        runId,
        authorId: owner.id,
        artifactId,
        body: `示例交付已批准。\n${sample}`,
        createdAt: at(task.due, minute),
      });
    }
  }
  if (review || blocked) {
    const grantId = blocked
      ? prototypeId("grant", task.org, task.number)
      : null;
    if (grantId)
      await tx.insert(grants).values({
        id: grantId,
        workspaceId,
        agentId: agent.id,
        taskId,
        runId,
        capability: "staging.write",
        reason: `${blocker}\n${sample}`,
        createdAt: at(8, minute),
      });
    const [profile] = await tx
      .select()
      .from(agentProfiles)
      .where(eq(agentProfiles.id, agent.id));
    // Same actual admin/owner/supervisor recipient policy as notifyPeople in runs.ts.
    const people = (
      await tx
        .select()
        .from(members)
        .where(eq(members.workspaceId, workspaceId))
    ).filter(
      (row) =>
        row.kind === "person" &&
        (row.role === "admin" ||
          row.id === owner.id ||
          row.id === profile?.supervisorId),
    );
    for (const [index, person] of people.entries()) {
      await tx.insert(inboxItems).values({
        id: prototypeId("inbox", task.org, task.number * 100 + index),
        workspaceId,
        memberId: person.id,
        agentId: agent.id,
        taskId,
        runId,
        grantId,
        kind: blocked ? "blocker" : "review",
        title: blocked ? blocker : task.title["zh-HK"],
        createdAt: at(8, minute),
      });
    }
  }
}
