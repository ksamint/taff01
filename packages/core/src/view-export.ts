import { createHash } from "node:crypto";
import {
  activity,
  type Database,
  projects,
  type Transaction,
  workspaces,
} from "@taff/db";
import {
  buildCalendarLayout,
  buildMindLayout,
  buildRelationsLayout,
  buildSummaryLayout,
  buildTimelineLayout,
  type CalendarImageInput,
  type CalendarViewData,
  calendarImageWindow,
  formatCalendarImageTime,
  GRAPH_LAYERS,
  type GraphImageInput,
  type GraphQuery,
  idSchema,
  localeSchema,
  type MindImageOptions,
  type MindMap,
  type MindMapQuery,
  type RelationGraph,
  type RelationsImageOptions,
  type SummaryImageLayoutInput,
  type SummaryLayout,
  type Timeline,
  type TimelineImageInput,
  type ViewExportInputQuery,
  viewExportQuerySchema,
} from "@taff/schemas";
import { and, eq, sql } from "drizzle-orm";
import { actorTimeZone } from "./actor-timezone";
import { CoreError, type Principal } from "./index";
import { digestLocalDate } from "./notifications-time";
import { type Action, type Actor, can, type Resource } from "./permissions";
import {
  estimateSummaryImageHeight,
  fitSummaryLayout,
  IMAGE_HEIGHT_BUDGET,
} from "./summary-layout";
import { summaryTranslate } from "./summary-messages";
import {
  buildDailySummary,
  type SummarySourceProject,
  summaryContentHash,
  summaryWatermark,
} from "./summary-model";
import { canonicalJson } from "./trusted-review";

type Dependencies = {
  db: Database;
  requireMember(
    q: Database | Transaction,
    p: Principal,
    w: string,
    a: Action,
    r?: Resource,
  ): Promise<Actor>;
  loadSummarySources(
    planActor: Actor,
    w: string,
    projectList: (typeof projects.$inferSelect)[],
    zone: string,
    day: string,
  ): Promise<SummarySourceProject[]>;
  now?: () => Date;
  getTimeline(p: Principal, projectId: string): Promise<Timeline>;
  listCalendar(
    p: Principal,
    workspaceId: string,
    range: { from: string; to: string },
    options?: { scheduledOnly?: boolean },
  ): Promise<CalendarViewData>;
  getMindMap(
    p: Principal,
    workspaceId: string,
    query: MindMapQuery,
  ): Promise<MindMap>;
  relationGraph(
    p: Principal,
    workspaceId: string,
    query: GraphQuery,
  ): Promise<RelationGraph>;
};

type NamedImage<T> = T & {
  /** REST uses ASCII; MCP preserves the agent name, including CJK. */
  fileName: string;
};
export type ViewExport = NamedImage<
  | SummaryImageLayoutInput
  | TimelineImageInput
  | CalendarImageInput
  | GraphImageInput
>;

function parse<T>(schema: { parse(v: unknown): T }, input: unknown): T {
  try {
    return schema.parse(input);
  } catch {
    throw new CoreError("invalid_input", 400);
  }
}

/**
 * Exported view images (ADR 0031). A person turns the workspace's project
 * overview, or one project, into the same designed layout the daily summary
 * uses, so the Rust renderer draws it unchanged. The data is live, read with
 * the exporter's own rights: finance only when they may read it, archived
 * projects only when named. The watermark binds every copy to the exporter,
 * the workspace and the instant; the hash binds it to the exact data.
 */
export function createViewExportOperations({
  db,
  requireMember,
  loadSummarySources,
  getTimeline,
  listCalendar,
  getMindMap,
  relationGraph,
  now = () => new Date(),
}: Dependencies) {
  function exportViewImageInput(
    p: Principal,
    workspaceId: string,
    query: ViewExportInputQuery & { view: "mind" | "relations" },
    channel?: "web" | "mcp",
  ): Promise<NamedImage<GraphImageInput>>;
  function exportViewImageInput(
    p: Principal,
    workspaceId: string,
    query: Omit<ViewExportInputQuery, "view" | "criticalPath"> & {
      view?: "overview" | "project";
    },
    channel?: "web" | "mcp",
  ): Promise<NamedImage<SummaryImageLayoutInput>>;
  function exportViewImageInput(
    p: Principal,
    workspaceId: string,
    query: ViewExportInputQuery & { view: "timeline" },
    channel?: "web" | "mcp",
  ): Promise<NamedImage<TimelineImageInput>>;
  function exportViewImageInput(
    p: Principal,
    workspaceId: string,
    query: ViewExportInputQuery & { view: "calendar" },
    channel?: "web" | "mcp",
  ): Promise<NamedImage<CalendarImageInput>>;
  function exportViewImageInput(
    p: Principal,
    workspaceId: string,
    query: ViewExportInputQuery,
    channel?: "web" | "mcp",
  ): Promise<ViewExport>;
  async function exportViewImageInput(
    p: Principal,
    workspaceId: string,
    query: ViewExportInputQuery,
    channel: "web" | "mcp" = "web",
  ): Promise<ViewExport> {
    const w = parse(idSchema, workspaceId);
    const actor = await requireMember(db, p, w, "view:export", {
      workspaceId: w,
    });
    const identity = await actorTimeZone(db, p, actor);
    const body = parse(viewExportQuerySchema, {
      ...query,
      locale: query.locale ?? localeSchema.parse(identity.locale),
    });
    const [workspace] = await db
      .select({ name: workspaces.name })
      .from(workspaces)
      .where(eq(workspaces.id, w));
    const projectList =
      body.view === "calendar"
        ? []
        : await db
            .select()
            .from(projects)
            .where(
              body.projectId
                ? and(
                    eq(projects.workspaceId, w),
                    eq(projects.id, body.projectId),
                  )
                : and(
                    eq(projects.workspaceId, w),
                    eq(projects.archived, false),
                  ),
            )
            .orderBy(projects.name, projects.id)
            .limit(101);
    if (body.projectId && projectList.length === 0)
      throw new CoreError("not_found", 404);
    const zone = identity.timeZone;
    const instant = now();
    const day = digestLocalDate(instant, zone);
    const workspaceName = workspace?.name ?? "";
    const t = summaryTranslate(body.locale);
    const generated = t("viewExport.generated", {
      date: new Intl.DateTimeFormat(body.locale, {
        dateStyle: "medium",
        timeStyle: "short",
        timeZone: zone,
      }).format(instant),
      zone,
    });
    async function finish(
      image:
        | SummaryImageLayoutInput
        | TimelineImageInput
        | CalendarImageInput
        | GraphImageInput,
      subject:
        | "workspace"
        | "project"
        | "timeline"
        | "calendar"
        | "mind"
        | "relations",
      projectCount: number,
      finance: boolean,
    ): Promise<ViewExport> {
      const actorId = actor.userId ?? actor.id;
      await db.transaction(async (tx) => {
        await tx.execute(
          sql`select set_config('taff.actor_id',${actorId},true)`,
        );
        await tx.insert(activity).values({
          workspaceId: w,
          actorId,
          action: "view.export",
          resourceId: body.projectId ?? w,
          details: {
            scope: subject,
            locale: body.locale,
            contentHash: image.contentHash,
            projectCount,
            finance,
            channel,
          },
        });
      });
      return {
        ...image,
        fileName: `taff-${subject}-${
          p.kind === "agent"
            ? `${Array.from(
                actor.name
                  .normalize("NFC")
                  .replace(/[\\/:*?"<>|\p{Cc}\p{Cf}]/gu, "_"),
              )
                .slice(0, 80)
                .join("")}-`
            : ""
        }${day}-${image.contentHash.slice(0, 8)}.png`,
      };
    }

    if (body.view === "calendar") {
      const query = {
        mode: body.calendarMode!,
        visibleDate: body.visibleDate!,
        timeZone: zone,
      };
      const window = calendarImageWindow(query);
      const source = await listCalendar(
        p,
        w,
        { from: window.from, to: window.to },
        { scheduledOnly: true },
      );
      const snapshot = {
        truncated: source.truncated,
        occurrences: source.occurrences.map((o) => ({
          id: o.id,
          startAt: o.startAt,
          endAt: o.endAt,
          task: {
            id: o.task.id,
            title: o.task.title,
            projectId: o.task.projectId,
          },
        })),
      };
      const contentHash = createHash("sha256")
        .update(
          canonicalJson({
            view: "calendar",
            window,
            locale: body.locale,
            workspaceName,
            exporter: actor.name,
            snapshot,
          }),
        )
        .digest("hex");
      const cut = (value: string, length: number) =>
        Array.from(value).slice(0, length).join("");
      const civilDate = (date: string) => new Date(`${date}T00:00:00Z`);
      const period =
        body.calendarMode === "month"
          ? new Intl.DateTimeFormat(body.locale, {
              year: "numeric",
              month: "long",
              timeZone: "UTC",
            }).format(civilDate(body.visibleDate!))
          : new Intl.DateTimeFormat(body.locale, {
              dateStyle: "medium",
              timeZone: "UTC",
            }).formatRange(
              civilDate(window.startDate),
              new Date(civilDate(window.endDate).getTime() - 86_400_000),
            );
      const layout = buildCalendarLayout(
        source,
        query,
        body.locale,
        {
          title: cut(t("viewExport.calendarHeading", { period }), 200),
          subtitle: cut(
            [
              workspaceName,
              t("viewExport.exportedBy", { name: actor.name }),
              zone,
            ].join(" · "),
            300,
          ),
          allDay: t("viewExport.allDay"),
          footer: cut(
            [
              t("viewExport.confidential", { name: actor.name }),
              generated,
            ].join(" · "),
            300,
          ),
          sourceTruncated: t("calendar.truncated"),
          date: (date) =>
            new Intl.DateTimeFormat(body.locale, {
              month: "short",
              day: "numeric",
              timeZone: "UTC",
            }).format(civilDate(date)),
          weekday: (date) =>
            new Intl.DateTimeFormat(body.locale, {
              weekday: "long",
              timeZone: "UTC",
            }).format(civilDate(date)),
          time: (start, end, timeZone) =>
            formatCalendarImageTime(start, end, body.locale, timeZone),
          more: (count) => t("summary.more", { count }),
        },
        contentHash,
      );
      const watermark = {
        contentHash,
        text: cut(
          [actor.name, workspaceName, day, t("viewExport.eyebrow")].join(" · "),
          500,
        ),
      };
      const projectCount = new Set(
        source.occurrences
          .map((o) => o.task.projectId)
          .filter((id) => id !== null),
      ).size;
      return finish(
        { layout, watermark, contentHash },
        "calendar",
        projectCount,
        false,
      );
    }
    if (body.view === "mind" || body.view === "relations") {
      const cut = (value: string, length: number) =>
        Array.from(value).slice(0, length).join("");
      const labels = {
        title: t(
          body.view === "mind" ? "mind.title" : "projects.relationsView",
        ),
        subtitle: cut(
          [
            workspaceName,
            ...(body.projectId ? [projectList[0].name] : []),
            t("viewExport.exportedBy", { name: actor.name }),
          ].join(" · "),
          300,
        ),
        footer: cut(
          [t("viewExport.confidential", { name: actor.name }), generated].join(
            " · ",
          ),
          300,
        ),
        empty: t(
          body.view === "mind" ? "viewExport.noMindNodes" : "relations.empty",
        ),
        more: (count: number) => t("viewExport.moreNodes", { count }),
        moreEdges: (count: number) => t("viewExport.moreEdges", { count }),
        centre: t("mind.centre"),
        ring: (layer: number) =>
          layer < 4
            ? t(`mind.layer.${layer}`)
            : t("mind.layerN", { n: layer + 1 }),
      };
      const options: MindImageOptions | RelationsImageOptions =
        body.view === "mind"
          ? { archived: body.archived ?? "exclude" }
          : {
              layout: body.layout ?? "layered",
              scope: body.scope ?? (body.projectId ? "project" : "workspace"),
              projectId: body.projectId ?? null,
              layers: GRAPH_LAYERS.filter((layer) =>
                (body.layers ?? GRAPH_LAYERS).includes(layer),
              ),
              forceSeed: body.forceSeed ?? 7,
            };
      let projectCount = 0;
      const pendingHash = "0".repeat(64);
      const layout =
        "archived" in options
          ? buildMindLayout(
              await getMindMap(p, w, options),
              options,
              body.locale,
              labels,
              pendingHash,
            )
          : await (async () => {
              const source = await relationGraph(p, w, {
                projectId: body.projectId,
                layers: options.layers,
              });
              projectCount = source.nodes.filter(
                (node) => node.kind === "project",
              ).length;
              return buildRelationsLayout(
                source,
                options,
                body.locale,
                labels,
                pendingHash,
              );
            })();
      // Hash only the displayed data/options: no private notes, source URLs, CRM details,
      // permissions, finance or generated-at timestamp. Rendering supplies the real hash below.
      const { footer: _footer, ...display } = layout;
      const contentHash = createHash("sha256")
        .update(
          canonicalJson({
            view: body.view,
            options,
            locale: body.locale,
            timeZone: zone,
            localDate: day,
            exporter: actor.name,
            workspaceName,
            display,
          }),
        )
        .digest("hex");
      return finish(
        {
          layout: {
            ...layout,
            footer: { ...layout.footer, hashFull: contentHash },
          },
          watermark: {
            contentHash,
            text: cut(
              [actor.name, workspaceName, day, t("viewExport.eyebrow")].join(
                " · ",
              ),
              500,
            ),
          },
          contentHash,
        },
        body.view,
        projectCount,
        false,
      );
    }
    if (body.view === "timeline") {
      const timeline = await getTimeline(p, body.projectId!);
      const criticalPath = body.criticalPath ?? "show";
      const display = {
        ...timeline,
        items: timeline.items.map((item) => ({
          ...item,
          critical: criticalPath === "show" && item.critical,
        })),
      };
      const contentHash = createHash("sha256")
        .update(
          canonicalJson({
            view: "timeline",
            projectId: body.projectId,
            criticalPath,
            locale: body.locale,
            timeZone: zone,
            workspaceName,
            projectName: projectList[0].name,
            exporter: actor.name,
            timeline: {
              ...display,
              canEditPlan: false,
              risk: { ...display.risk, finance: null },
            },
          }),
        )
        .digest("hex");
      const cut = (value: string, length: number) =>
        Array.from(value).slice(0, length).join("");
      const layout = buildTimelineLayout(
        display,
        body.locale,
        {
          title: cut(
            t("viewExport.timelineHeading", { project: projectList[0].name }),
            200,
          ),
          subtitle: cut(
            [
              workspaceName,
              t("viewExport.exportedBy", { name: actor.name }),
            ].join(" · "),
            300,
          ),
          today: t("today"),
          footer: cut(
            [
              t("viewExport.confidential", { name: actor.name }),
              generated,
            ].join(" · "),
            300,
          ),
          more: (count) => t("summary.more", { count }),
          date: (civil) =>
            new Intl.DateTimeFormat(body.locale, {
              month: "short",
              day: "numeric",
              timeZone: "UTC",
            }).format(new Date(civil + "T00:00:00Z")),
        },
        contentHash,
      );
      const watermark = {
        contentHash,
        text: cut(
          [actor.name, workspaceName, day, t("viewExport.eyebrow")].join(" · "),
          500,
        ),
      };
      return finish({ layout, watermark, contentHash }, "timeline", 1, false);
    }
    const finance = can(actor, "finance:read", { workspaceId: w });
    const sources = await loadSummarySources(actor, w, projectList, zone, day);
    const snapshot = buildDailySummary({
      localDate: day,
      timeZone: zone,
      workspaceName,
      tag: { kind: "shareholder", org: workspaceName, label: "" },
      recipient: {
        name: actor.name,
        includeFinance: finance,
        showPeople: true,
      },
      projects: sources,
    });
    const contentHash = summaryContentHash(snapshot);
    const base = summaryWatermark(snapshot, null, contentHash);
    const watermark = {
      ...base,
      text: [actor.name, workspaceName, day, "export"].join(" · "),
    };
    const createdAt = instant.toISOString();
    const layout = fitSummaryLayout(
      (limits) =>
        relabel(
          buildSummaryLayout(
            snapshot,
            watermark,
            contentHash,
            createdAt,
            body.locale,
            t,
            limits,
          ),
          {
            title: t(
              body.projectId
                ? "viewExport.projectHeading"
                : "viewExport.workspaceHeading",
            ),
            audience: t("viewExport.eyebrow"),
            recipient: t("viewExport.exportedBy", { name: actor.name }),
            confidential: t("viewExport.confidential", { name: actor.name }),
            generated: t("viewExport.generated", {
              date: new Intl.DateTimeFormat(body.locale, {
                dateStyle: "medium",
                timeStyle: "short",
                timeZone: zone,
              }).format(instant),
              zone,
            }),
            empty: t("viewExport.noProjects"),
          },
        ),
      (candidate) =>
        estimateSummaryImageHeight(candidate) <= IMAGE_HEIGHT_BUDGET,
    );
    return finish(
      { layout, watermark, contentHash },
      body.projectId ? "project" : "workspace",
      snapshot.projects.length,
      finance,
    );
  }
  return { exportViewImageInput };
}

/** Swaps the summary's recipient wording for the exporter's, within limits. */
function relabel(
  layout: SummaryLayout,
  labels: {
    title: string;
    audience: string;
    recipient: string;
    confidential: string;
    generated: string;
    empty: string;
  },
): SummaryLayout {
  const cut = (value: string, max: number) =>
    Array.from(value).slice(0, max).join("");
  return {
    ...layout,
    header: {
      ...layout.header,
      title: cut(labels.title, 100),
      audience: cut(labels.audience, 340),
      recipient: cut(labels.recipient, 160),
    },
    empty: layout.empty === null ? null : cut(labels.empty, 200),
    footer: {
      ...layout.footer,
      confidential: cut(labels.confidential, 200),
      generated: cut(labels.generated, 200),
    },
  };
}
