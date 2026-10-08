import type { Member, Project, QuickAddResult } from "@taff/schemas";
export function localDate(now: Date, tz: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (key: string) => parts.find((p) => p.type === key)?.value;
  return `${part("year")}-${part("month")}-${part("day")}`;
}
/** Resolve a local wall time without fixed-zone arithmetic; nonexistent DST times are rejected. */
export function zonedInstant(
  day: string,
  time: string,
  tz: string,
): Date | null {
  const desired = Date.parse(`${day}T${time}:00Z`);
  if (!Number.isFinite(desired)) return null;
  let value = desired;
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const wall = (instant: number) => {
    const parts = formatter.formatToParts(new Date(instant));
    const part = (key: string) => parts.find((p) => p.type === key)?.value;
    return Date.parse(
      `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}:${part("second")}Z`,
    );
  };
  for (let i = 0; i < 4; i++) {
    const delta = desired - wall(value);
    if (!delta) return new Date(value);
    value += delta;
  }
  return wall(value) === desired ? new Date(value) : null;
}
function escape(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
export function parseQuickAddText(
  text: string,
  options: {
    members: Pick<Member, "id" | "name" | "kind">[];
    projects: Pick<Project, "id" | "name">[];
    ownerId: string | null;
    tz: string;
    now: Date;
  },
): QuickAddResult {
  const out: QuickAddResult = {
    title: "",
    ownerId: options.ownerId,
    workerId: null,
    priority: 3,
    projectId: null,
    labels: [],
    dueDate: null,
    dueTime: null,
    dueAt: null,
    warnings: [],
    unresolved: [],
  };
  let rest = text;
  const warn = (key: QuickAddResult["warnings"][number], value?: string) => {
    if (!out.warnings.includes(key)) out.warnings.push(key);
    if (value) out.unresolved.push(value);
  };
  rest = rest.replace(
    /!(urgent|high|medium|low|p[0-4]|緊急|紧急|高|中|低)(?=$|\s|[@#+,，])/gi,
    (_, raw: string) => {
      const key = raw.toLowerCase();
      out.priority =
        (
          {
            urgent: 1,
            high: 2,
            medium: 3,
            low: 4,
            p0: 1,
            p1: 1,
            p2: 2,
            p3: 3,
            p4: 4,
            緊急: 1,
            紧急: 1,
            高: 2,
            中: 3,
            低: 4,
          } as Record<string, number>
        )[key] ?? 3;
      return "";
    },
  );
  // Longest known names first, including quoted multiword mentions and unique first-name aliases.
  const candidates = options.members
    .flatMap((m) =>
      [m.name, m.name.split(" ")[0]].map((name) => ({ name, member: m })),
    )
    .sort((a, b) => b.name.length - a.name.length);
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const key = candidate.name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const pattern = new RegExp(
      `@(?:"${escape(candidate.name)}"|${escape(candidate.name)})(?=$|\\s|[#!,，])`,
      "gi",
    );
    if (!pattern.test(rest)) continue;
    pattern.lastIndex = 0;
    const matches = options.members.filter(
      (m) =>
        m.name.toLowerCase() === key ||
        m.name.split(" ")[0].toLowerCase() === key,
    );
    rest = rest.replace(pattern, "");
    if (matches.length !== 1) {
      warn("ambiguous_member", candidate.name);
      continue;
    }
    const member = matches[0];
    if (member.kind === "agent") out.workerId = member.id;
    else out.ownerId = member.id;
  }
  rest = rest.replace(/@("[^"]+"|[^\s@#!]+)/g, (_, name: string) => {
    warn("unknown_member", name.replace(/^"|"$/g, ""));
    return "";
  });
  rest = rest.replace(/#("[^"]+"|[^\s@#!]+)/g, (_, raw: string) => {
    const name = raw.replace(/^"|"$/g, "");
    const matches = options.projects.filter(
      (p) => p.name.toLowerCase() === name.toLowerCase(),
    );
    if (matches.length === 1) out.projectId = matches[0].id;
    else warn(matches.length ? "ambiguous_project" : "unknown_project", name);
    return "";
  });
  rest = rest.replace(/\+([^\s+@#!]+)/g, (_, label: string) => {
    if (
      label.length <= 40 &&
      !out.labels.includes(label) &&
      out.labels.length < 20
    )
      out.labels.push(label);
    return "";
  });
  const today = localDate(options.now, options.tz);
  const shifted = (offset: number) => {
    const date = new Date(`${today}T12:00:00Z`);
    date.setUTCDate(date.getUTCDate() + offset);
    return date.toISOString().slice(0, 10);
  };
  rest = rest.replace(
    /\b(day after tomorrow|tomorrow|today)\b|大後天|大后天|後天|后天|明天|今天/gi,
    (raw: string) => {
      out.dueDate = shifted(
        /大後天|大后天/.test(raw)
          ? 3
          : /day after|後天|后天/i.test(raw)
            ? 2
            : /tomorrow|明天/i.test(raw)
              ? 1
              : 0,
      );
      return "";
    },
  );
  rest = rest.replace(
    /\b(next\s+)?(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b|(下)?(?:周|週|星期)([一二三四五六日天])/gi,
    (
      _,
      next: string | undefined,
      en: string | undefined,
      zhNext: string | undefined,
      zh: string | undefined,
    ) => {
      const weekday = en
        ? [
            "sunday",
            "monday",
            "tuesday",
            "wednesday",
            "thursday",
            "friday",
            "saturday",
          ].indexOf(en.toLowerCase())
        : (
            {
              一: 1,
              二: 2,
              三: 3,
              四: 4,
              五: 5,
              六: 6,
              日: 0,
              天: 0,
            } as Record<string, number>
          )[zh ?? ""];
      const current = new Date(`${today}T12:00:00Z`).getUTCDay();
      let offset = (weekday - current + 7) % 7;
      if (next || zhNext) offset = (weekday || 7) - (current || 7) + 7;
      out.dueDate = shifted(offset);
      return "";
    },
  );
  rest = rest.replace(/\b\d{4}-\d{2}-\d{2}\b/g, (raw: string) => {
    const date = new Date(`${raw}T12:00:00Z`);
    if (
      !Number.isNaN(date.getTime()) &&
      date.toISOString().slice(0, 10) === raw
    )
      out.dueDate = raw;
    else warn("invalid_date", raw);
    return "";
  });
  const setTime = (hour: number, minute: number) => {
    if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
      warn("invalid_time");
      return;
    }
    out.dueTime = `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
  };
  rest = rest.replace(
    /\b(?:at\s+)?(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/gi,
    (_, h: string, m: string | undefined, meridian: string) => {
      const hour = Number(h);
      if (hour < 1 || hour > 12) warn("invalid_time");
      else
        setTime(
          (hour % 12) + (meridian.toLowerCase() === "pm" ? 12 : 0),
          Number(m ?? 0),
        );
      return "";
    },
  );
  rest = rest.replace(
    /(上午|下午|晚上|早上|中午)?(\d{1,2})(?:點|点|時|时)(半|\d{1,2}(?:分)?)?/g,
    (_, period: string | undefined, h: string, m: string | undefined) => {
      let hour = Number(h);
      if (period && ["下午", "晚上", "中午"].includes(period) && hour < 12)
        hour += 12;
      if (period && ["上午", "早上"].includes(period) && hour === 12) hour = 0;
      setTime(hour, m === "半" ? 30 : Number(m?.replace("分", "") ?? 0));
      return "";
    },
  );
  rest = rest.replace(
    /\b(?:at\s+)?(\d{1,2}):(\d{2})\b/gi,
    (_, h: string, m: string) => {
      setTime(Number(h), Number(m));
      return "";
    },
  );
  if (out.dueTime && !out.dueDate) out.dueDate = today;
  if (out.dueDate) {
    const instant = zonedInstant(
      out.dueDate,
      out.dueTime ?? "23:59",
      options.tz,
    );
    if (instant) {
      if (!out.dueTime) instant.setTime(instant.getTime() + 59999);
      out.dueAt = instant.toISOString();
    } else warn("invalid_time");
  }
  out.title = rest.replace(/\s+/g, " ").trim();
  if (!out.title) warn("empty_title");
  return out;
}
