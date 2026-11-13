import type { Timeline, TimelineItem } from "./plan";
import {
  buildTimelineLayout,
  type TimelineImageInput,
  type TimelineImageLabels,
} from "./timeline-image";

export function timelineFixture(count = 6): Timeline {
  const items: TimelineItem[] = Array.from({ length: count }, (_, index) => ({
    id: `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
    kind: index === 3 ? "milestone" : "task",
    title: `Delivery ${index + 1}`,
    parentId: null,
    depth: index % 3,
    start: "2026-03-07",
    end: index === 3 ? "2026-03-07" : "2026-03-12",
    durationDays: index === 3 ? 0 : 6,
    planned: true,
    progress: (index * 15) % 101,
    status: "in_progress",
    ownerId: null,
    workerId: null,
    workerIsAgent: false,
    blocked: index === 2,
    hasChildren: false,
    behindDays: 2,
    forecastEnd: "2026-03-14",
    critical: index === 2,
    version: 1,
    taskVersion: 1,
  }));
  return {
    projectId: "00000000-0000-4000-8000-000000009999",
    today: "2026-03-08",
    timeZone: "America/New_York",
    items,
    dependencies: items.slice(1).map((item, index) => ({
      id: item.id,
      from: { kind: items[index].kind, id: items[index].id },
      to: { kind: item.kind, id: item.id },
      conflict: index === 1,
    })),
    risk: {
      level: "high",
      reasons: ["slip"],
      start: "2026-03-07",
      plannedEnd: "2026-03-12",
      forecastEnd: "2026-03-14",
      slipDays: 2,
      deliveryPercent: 30,
      driverTaskId: null,
      blockedTaskId: null,
      conflictDependencyId: null,
      lastMilestoneId: null,
      finance: null,
    },
    canEditPlan: false,
  };
}
export function timelineImageFixture(
  locale: "en" | "zh-CN" | "zh-HK",
  count = 6,
): TimelineImageInput {
  const copy = {
    en: ["Timeline", "Exported by Alice", "Today", "more", "Delivery"],
    "zh-CN": ["项目时间线", "由艾丽丝导出", "今天", "项", "项目交付"],
    "zh-HK": ["項目時間線", "由艾麗絲匯出", "今天", "項", "項目交付"],
  }[locale];
  const labels: TimelineImageLabels = {
    title: copy[0],
    subtitle: copy[1],
    today: copy[2],
    footer: `${copy[1]} · 2026-03-08 12:00`,
    more: (n) => `+${n} ${copy[3]}`,
    date: (d) =>
      new Intl.DateTimeFormat(locale, {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${d}T00:00:00Z`)),
  };
  const timeline = timelineFixture(count);
  timeline.items.forEach((item, index) => {
    item.title = `${copy[4]} ${index + 1} · 侍饕餮鑫`;
  });
  const contentHash = "a".repeat(64);
  return {
    layout: buildTimelineLayout(timeline, locale, labels, contentHash),
    watermark: { text: `${copy[1]} · Taff · 2026-03-08`, contentHash },
    contentHash,
  };
}
