import {
  type Database,
  projects,
  type Transaction,
  workspaces,
} from "@taff/db";
import {
  buildSummaryLayout,
  idSchema,
  type SummaryImageLayoutInput,
  type SummaryLayout,
  type ViewExportQuery,
  viewExportQuerySchema,
} from "@taff/schemas";
import { and, eq } from "drizzle-orm";
import { zoneOf } from "./actor-timezone";
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
};

export type ViewExport = SummaryImageLayoutInput & {
  /** ASCII-only download name; the renderer never sees it. */
  fileName: string;
};

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
  now = () => new Date(),
}: Dependencies) {
  async function exportViewImageInput(
    p: Principal,
    workspaceId: string,
    query: ViewExportQuery,
  ): Promise<ViewExport> {
    const body = parse(viewExportQuerySchema, query);
    const w = parse(idSchema, workspaceId);
    const actor = await requireMember(db, p, w, "view:export", {
      workspaceId: w,
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
    const zone = await zoneOf(db, p, actor);
    const instant = now();
    const day = digestLocalDate(instant, zone);
    const finance = can(actor, "finance:read", { workspaceId: w });
    const sources = await loadSummarySources(actor, w, projectList, zone, day);
    const workspaceName = workspace?.name ?? "";
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
    const t = summaryTranslate(body.locale);
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
    const subject = body.projectId ? "project" : "workspace";
    return {
      layout,
      watermark,
      contentHash,
      fileName: `taff-${subject}-${day}-${contentHash.slice(0, 8)}.png`,
    };
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
