import { createHash } from "node:crypto";
import {
  activity,
  type Database,
  projects,
  type Transaction,
  workspaces,
} from "@taff/db";
import {
  buildSummaryLayout,
  buildTimelineLayout,
  idSchema,
  localeSchema,
  type SummaryImageLayoutInput,
  type SummaryLayout,
  type Timeline,
  type TimelineImageInput,
  type ViewExportInputQuery,
  type ViewExportQuery,
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
};

type NamedImage<T> = T & {
  /** REST uses ASCII; MCP preserves the agent name, including CJK. */
  fileName: string;
};
export type ViewExport = NamedImage<
  SummaryImageLayoutInput | TimelineImageInput
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
  now = () => new Date(),
}: Dependencies) {
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
    const projectList = await db
      .select()
      .from(projects)
      .where(
        body.projectId
          ? and(eq(projects.workspaceId, w), eq(projects.id, body.projectId))
          : and(eq(projects.workspaceId, w), eq(projects.archived, false)),
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
      image: SummaryImageLayoutInput | TimelineImageInput,
      subject: "workspace" | "project" | "timeline",
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
