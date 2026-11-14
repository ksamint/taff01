// View templates (spec: docs/spec/operation-templates.md). A view template is
// data: it names sectors and the task label that places a task in a sector.
// Applying it changes nothing; the Projects 營運 view regroups tagged tasks.

export type OperationSector = {
  /** Task label that places a task in this sector (exact match). */
  label: string;
  /** English sector name shown beside the label. */
  english: string;
  /** 領先指標 / leading indicator, bilingual. */
  leading: string;
  /** 結果指標 / result indicator, bilingual. */
  result: string;
};

/** Indicator headings: template data, bilingual like the sector names. */
export const SECTOR_INDICATORS = {
  leading: "領先指標 Leading",
  result: "結果指標 Result",
} as const;

/** 通用營運模板 / Generic operation template: the six recommended sectors. */
export const GENERIC_OPERATION_SECTORS: readonly OperationSector[] = [
  {
    label: "財務與現金",
    english: "Finance & Cash",
    leading: "逾期應收 Overdue receivables",
    result: "收入與毛利對預算 Revenue and margin vs budget",
  },
  {
    label: "客戶與市場",
    english: "Customers & Market",
    leading: "新增合格商機 New qualified pipeline",
    result: "留存或複購率 Retention or repeat rate",
  },
  {
    label: "營運與交付",
    english: "Operations & Delivery",
    leading: "工作量對產能 Workload vs capacity",
    result: "準時交付與品質投訴 On-time delivery and complaints",
  },
  {
    label: "人才與組織",
    english: "People & Organization",
    leading: "關鍵職缺空缺天數 Days critical roles open",
    result: "關鍵人才流失 Key people lost",
  },
  {
    label: "風險與安全",
    english: "Risk & Security",
    leading: "逾期整改事項 Overdue remediation items",
    result: "事件數 Incidents",
  },
  {
    label: "未來",
    english: "Future (strategy, product, succession)",
    leading: "戰略里程碑 Strategic milestones",
    result: "新業務收入占比 Revenue share from new lines",
  },
];

export type SectorGroup<T> = {
  sector: OperationSector;
  /** Tasks carrying the sector label, by project in `projectOrder`, then no project. */
  projects: { projectId: string | null; tasks: T[] }[];
  count: number;
};

/**
 * Regroups tasks by sector (spec OT-1). A task appears under every sector
 * whose label it carries; a task with no sector label is left out. Project
 * groups follow `projectOrder` (unlisted projects after it, "no project"
 * last); tasks keep their input order within a group.
 */
export function groupBySector<
  T extends { labels: string[]; projectId: string | null },
>(
  tasks: readonly T[],
  projectOrder: readonly string[] = [],
  sectors: readonly OperationSector[] = GENERIC_OPERATION_SECTORS,
): SectorGroup<T>[] {
  const rank = (id: string | null) => {
    if (id === null) return Number.MAX_SAFE_INTEGER;
    const index = projectOrder.indexOf(id);
    return index === -1 ? projectOrder.length : index;
  };
  return sectors.map((sector) => {
    const byProject = new Map<string | null, T[]>();
    let count = 0;
    for (const task of tasks) {
      if (!task.labels.includes(sector.label)) continue;
      const list = byProject.get(task.projectId) ?? [];
      list.push(task);
      byProject.set(task.projectId, list);
      count++;
    }
    return {
      sector,
      projects: [...byProject]
        .sort(([a], [b]) => rank(a) - rank(b))
        .map(([projectId, list]) => ({ projectId, tasks: list })),
      count,
    };
  });
}
