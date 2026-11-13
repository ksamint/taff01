import { calendarWallToInstant } from "./calendar";
import {
  buildCalendarLayout,
  type CalendarImageInput,
  type CalendarImageLabels,
  formatCalendarImageTime,
} from "./calendar-image";
import type { CalendarOccurrence, CalendarViewData } from "./calendar-read";

export function calendarOccurrenceFixture(
  index: number,
  start: string,
  end: string,
  zone = "America/New_York",
): CalendarOccurrence {
  const id = `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`;
  const startAt = calendarWallToInstant(start, zone),
    endAt = calendarWallToInstant(end, zone);
  return {
    id: `${id}:${startAt}`,
    startAt,
    endAt,
    canSchedule: false,
    isAgent: false,
    schedule: {
      taskId: id,
      workspaceId: id,
      startAt,
      endAt,
      timeZone: zone,
      rrule: null,
    },
    task: {
      id,
      workspaceId: id,
      number: index + 1,
      title: `Delivery ${index}`,
      description: "",
      priority: 2,
      projectId: null,
      labels: [],
      parentId: null,
      version: 1,
      ownerId: id,
      workerId: null,
      status: "todo",
      dueAt: null,
      createdAt: startAt,
      updatedAt: startAt,
    },
  };
}
export function calendarLabelsFixture(
  locale: "en" | "zh-CN" | "zh-HK",
): CalendarImageLabels {
  const copy = {
    en: [
      "Calendar",
      "Exported by Alice",
      "All day",
      "more",
      "Some source results were omitted",
    ],
    "zh-CN": ["项目日历", "由艾丽丝导出", "全天", "项", "来源结果不完整"],
    "zh-HK": ["項目日曆", "由艾麗絲匯出", "全天", "項", "來源結果不完整"],
  }[locale];
  return {
    title: copy[0],
    subtitle: `${copy[1]} · America/New_York`,
    allDay: copy[2],
    footer: `${copy[1]} · 2026-03-08 12:00`,
    sourceTruncated: copy[4],
    more: (n) => `+${n} ${copy[3]}`,
    date: (d) =>
      new Intl.DateTimeFormat(locale, {
        month: "short",
        day: "numeric",
        timeZone: "UTC",
      }).format(new Date(`${d}T00:00:00Z`)),
    weekday: (d) =>
      new Intl.DateTimeFormat(locale, {
        weekday: "long",
        timeZone: "UTC",
      }).format(new Date(`${d}T00:00:00Z`)),
    time: (start, end, timeZone) =>
      formatCalendarImageTime(start, end, locale, timeZone),
  };
}
export function calendarImageFixture(
  locale: "en" | "zh-CN" | "zh-HK",
  mode: "week" | "month",
): CalendarImageInput {
  const source: CalendarViewData = {
    unscheduled: [],
    truncated: true,
    occurrences: [
      calendarOccurrenceFixture(0, "2026-03-01T00:00", "2026-03-04T00:00"),
      calendarOccurrenceFixture(1, "2026-03-07T23:00", "2026-03-09T02:00"),
      calendarOccurrenceFixture(2, "2026-03-08T00:00", "2026-03-09T00:00"),
      ...Array.from({ length: 9 }, (_, index) =>
        calendarOccurrenceFixture(
          index + 3,
          `2026-03-03T${String(index + 8).padStart(2, "0")}:00`,
          `2026-03-03T${String(index + 9).padStart(2, "0")}:00`,
        ),
      ),
    ],
  };
  source.occurrences.forEach((item, index) => {
    item.task.title = `${locale === "en" ? "Delivery" : locale === "zh-CN" ? "项目交付" : "項目交付"} ${index + 1} · 侍饕餮鑫`;
  });
  const contentHash = "a".repeat(64),
    labels = calendarLabelsFixture(locale);
  return {
    layout: buildCalendarLayout(
      source,
      { visibleDate: "2026-03-08", mode, timeZone: "America/New_York" },
      locale,
      labels,
      contentHash,
    ),
    watermark: { text: `${labels.footer} · Taff`, contentHash },
    contentHash,
  };
}
