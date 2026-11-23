"use client";
import "../styles/timeline.css";
// Timeline (M16, prototype Module Plan 105–187 and 448–550): a hand-rolled
// SVG Gantt over the server's plan model. The client renders the model and
// never recomputes it; drags and the selection footer call the plan and
// dependency APIs through `lib/mutations/timeline.ts`.
import type { Project, ProjectPhase, Task } from "@taff/schemas";
import { taskReference } from "@taff/schemas/base";
import type {
  Timeline,
  TimelineDependency,
  TimelineItem,
} from "@taff/schemas/plan";
import {
  ChevronDown,
  ExternalLink,
  Network,
  Pencil,
  Plus,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  type KeyboardEvent,
  type PointerEvent,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { errorKey } from "../lib/api";
import { isLocale } from "../lib/i18n";
import {
  type PlanEnd,
  shiftsChildren,
  useAddDependency,
  useRemoveDependency,
  useSaveMilestone,
  useSetPlan,
} from "../lib/mutations/timeline";
import { useProjectPhases } from "../lib/project-phases";
import { useMembers, useTasks, useWorkspaceAccess } from "../lib/queries";
import {
  addDays,
  arrowPath,
  barGeometry,
  dateToX,
  daysBetween,
  dayWidthFor,
  deltaDays,
  type Scale,
  scaleFor,
  ticks,
  visibleRows,
  type Zoom,
} from "../lib/timeline-geometry";
import { useTimeline } from "../lib/timeline-queries";
import { useDesktop } from "../lib/use-desktop";
import { useWorkspace } from "./app-shell";
import { ProjectFinancePanel } from "./project-finance-panel";
import { ProjectHealthUpdates } from "./project-health-updates";
import { ProjectPhaseSheet } from "./project-phase-sheet";
import { Button } from "./ui/button";
import { SheetDialog } from "./ui/sheet-dialog";
import { ViewExportButton } from "./view-export";

type Translate = ReturnType<typeof useTranslation>["t"];
type Drag = {
  mode: "move" | "resize" | "link";
  id: string;
  pointerId: number;
  startX: number;
  dx: number;
  x: number;
  y: number;
  scale: Scale;
};
const HEADER = 44;
const DATE_WINDOW_THRESHOLD = 400;

export function TimelineView({ project }: { project: Project | undefined }) {
  const { t } = useTranslation();
  if (!project)
    return (
      <p className="timeline-empty" data-testid="timeline-pick-project">
        {t("timeline.pickProject")}
      </p>
    );
  return <ProjectTimeline project={project} />;
}

function ProjectTimeline({ project }: { project: Project }) {
  const { workspace, confirmed } = useWorkspace();
  const { t, i18n } = useTranslation();
  const locale = isLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : "en";
  const desktop = useDesktop();
  const searchParams = useSearchParams();
  const query = useTimeline(project.id);
  const phaseQuery = useProjectPhases(project.id, confirmed);
  const phases = useMemo(
    () =>
      phaseQuery.isSuccess
        ? [...phaseQuery.data].sort(
            (a, b) => a.position - b.position || a.id.localeCompare(b.id),
          )
        : [],
    [phaseQuery.data, phaseQuery.isSuccess],
  );
  const members = useMembers(workspace.id);
  const tasks = useTasks(workspace.id);
  const setPlan = useSetPlan(project.id);
  const saveMilestone = useSaveMilestone(project.id);
  const access = useWorkspaceAccess(workspace.id);
  const canManagePhases =
    confirmed &&
    !project.archived &&
    access.isSuccess &&
    access.data.canManageProjects;
  const [phaseDialog, setPhaseDialog] = useState<{
    projectId: string;
    phase: ProjectPhase | null;
  } | null>(null);
  const [milestoneDialog, setMilestoneDialog] = useState<{
    item: TimelineItem | null;
    archive?: boolean;
  } | null>(null);
  const addDependency = useAddDependency(project.id);
  const removeDependency = useRemoveDependency(project.id);
  const hintId = useId();
  const financeId = useId();
  const [openFinanceProject, setOpenFinanceProject] = useState<string | null>(
    null,
  );
  const financeOpen = openFinanceProject === project.id;
  const [zoom, setZoom] = useState<Zoom>("day");
  const [critical, setCritical] = useState(true);
  const [linkMode, setLinkMode] = useState(false);
  const [linkFrom, setLinkFrom] = useState<PlanEnd | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(
    searchParams.get("task"),
  );
  const [drag, setDrag] = useState<Drag | null>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewport, setViewport] = useState(800);
  const [horizontal, setHorizontal] = useState({ left: 0, width: 1024 });
  const scroller = useRef<HTMLDivElement>(null);
  const chart = useRef<SVGSVGElement>(null);
  const rowButtons = useRef(new Map<string, HTMLButtonElement>());
  const focusNext = useRef<string | null>(null);

  const timeline = query.data;
  const phone = !desktop;
  const rowHeight = phone ? 44 : 36;
  const labelWidth = phone ? 132 : 268;
  const handle = phone ? 44 : 24;
  const layoutScale = useMemo(
    () =>
      timeline
        ? scaleFor(timeline, dayWidthFor(zoom, phone), phases)
        : undefined,
    [timeline, zoom, phone, phases],
  );
  const scale = drag?.scale ?? layoutScale;
  const dates = useMemo(() => {
    const short = new Intl.DateTimeFormat(locale, {
      timeZone: "UTC",
      day: "numeric",
      month: "short",
    });
    const full = new Intl.DateTimeFormat(locale, {
      timeZone: "UTC",
      dateStyle: "medium",
    });
    const numbers = new Intl.NumberFormat(locale);
    return {
      short: (date: string) => short.format(new Date(`${date}T00:00:00Z`)),
      full: (date: string) => full.format(new Date(`${date}T00:00:00Z`)),
      day: (date: string) => numbers.format(Number(date.slice(8))),
      number: (value: number) => numbers.format(value),
    };
  }, [locale]);

  // Keep the visible date anchored when a phase extends the range to the left.
  const todayX = scale && timeline ? dateToX(scale, timeline.today) : 0;
  const scrolledFor = useRef<{
    key: string;
    origin: string;
    element: HTMLDivElement;
  } | null>(null);
  useLayoutEffect(() => {
    const element = scroller.current;
    if (!element || !scale || !timeline) return;
    const key = `${project.id}:${zoom}`;
    const previous = scrolledFor.current;
    if (previous?.key !== key || previous.element !== element) {
      const firstPhase = phases.reduce(
        (first, phase) => (phase.start < first ? phase.start : first),
        phases[0]?.start ?? timeline.today,
      );
      const anchorX = timeline.items.length
        ? todayX
        : dateToX(scale, firstPhase);
      element.scrollLeft = Math.max(0, anchorX - scale.dayWidth * 3);
    } else if (previous.origin !== scale.origin) {
      element.scrollLeft += dateToX(scale, previous.origin);
    }
    scrolledFor.current = { key, origin: scale.origin, element };
    setViewport(element.clientHeight);
    if (scale.days > DATE_WINDOW_THRESHOLD) {
      const measure = () =>
        setHorizontal({ left: element.scrollLeft, width: element.clientWidth });
      measure();
      const observer = new ResizeObserver(measure);
      observer.observe(element);
      return () => observer.disconnect();
    }
  }, [project.id, zoom, scale, timeline, todayX, phases]);

  const items = timeline?.items ?? [];
  const index = useMemo(
    () => new Map(items.map((item, i) => [item.id, i])),
    [items],
  );
  const selected = selectedId
    ? items.find((item) => item.id === selectedId)
    : undefined;

  // Arrow keys move focus to a row that virtualization may not render yet.
  useEffect(() => {
    const id = focusNext.current;
    if (!id) return;
    const button = rowButtons.current.get(id);
    if (button) {
      focusNext.current = null;
      button.focus();
    }
  });

  if (query.isPending)
    return <p className="loading timeline-loading">{t("loading")}</p>;
  if (query.isError || !timeline || !scale)
    return (
      <p className="alert timeline-alert" role="alert">
        {t(errorKey(query.error))}
      </p>
    );

  const canEdit = timeline.canEditPlan;
  const memberById = new Map((members.data ?? []).map((m) => [m.id, m]));
  const taskById = new Map<string, Task>(
    (tasks.data ?? []).map((task) => [task.id, task]),
  );
  const reference = (item: TimelineItem) => {
    const task = item.kind === "task" ? taskById.get(item.id) : undefined;
    return task ? taskReference(workspace.key, task.number) : null;
  };
  const who = (item: TimelineItem) =>
    memberById.get(item.workerId ?? item.ownerId ?? "")?.name ?? "";
  const conflicted = new Set(
    timeline.dependencies.filter((dep) => dep.conflict).map((dep) => dep.to.id),
  );
  const chartWidth = scale.days * scale.dayWidth;
  const rowCount = items.length + phases.length;
  const rowsHeight = rowCount * rowHeight;
  const { from, to } = visibleRows(rowCount, scrollTop, viewport, rowHeight);
  const rows = items.slice(from, to);
  const fromPhase = Math.max(0, from - items.length);
  const phaseRows = phases.slice(fromPhase, Math.max(0, to - items.length));
  const daysOnScreen = visibleRows(
    scale.days,
    horizontal.left,
    horizontal.width,
    scale.dayWidth,
    DATE_WINDOW_THRESHOLD,
    14,
  );
  const { weeks, days } = ticks(scale, daysOnScreen.from, daysOnScreen.to);
  const phaseRange = (phase: ProjectPhase) =>
    t("timeline.phaseRange", {
      start: dates.full(phase.start),
      end: dates.full(phase.end),
    });
  const choosePhase = (phase: ProjectPhase | null) => {
    setPhaseDialog({ projectId: project.id, phase });
  };

  const endOf = (item: TimelineItem) => ({ kind: item.kind, id: item.id });
  const pick = (item: TimelineItem) => {
    if (linkMode && canEdit) {
      if (!linkFrom) {
        setLinkFrom(endOf(item));
        return;
      }
      addDependency.add(linkFrom, endOf(item));
      setLinkFrom(null);
      return;
    }
    setSelectedId(item.id);
  };
  const rowLabel = (item: TimelineItem) => {
    if (item.kind === "milestone")
      return t("timeline.milestoneLabel", {
        title: item.title,
        date: dates.short(item.start),
      });
    const flags = [
      item.blocked ? t("timeline.blocked") : null,
      conflicted.has(item.id) ? t("timeline.conflict") : null,
      item.critical ? t("timeline.criticalPath") : null,
      item.workerIsAgent ? t("timeline.agentWork") : null,
    ].filter(Boolean);
    return [
      t("timeline.rowLabel", {
        title: [reference(item), item.title].filter(Boolean).join(" "),
        start: dates.short(item.start),
        end: dates.short(item.end),
        duration: t("timeline.days", { count: item.durationDays }),
        progress: item.progress,
        who: who(item) || t("unassigned"),
      }),
      ...flags,
    ].join(", ");
  };
  const moveSelection = (event: KeyboardEvent, item: TimelineItem) => {
    if (
      (event.key === "ArrowLeft" || event.key === "ArrowRight") &&
      !event.altKey &&
      !event.ctrlKey &&
      !event.metaKey
    ) {
      event.preventDefault();
      if (
        canEdit &&
        (item.kind !== "milestone" || access.data?.canManageProjects) &&
        !setPlan.isPending &&
        !saveMilestone.isPending
      ) {
        const days =
          (event.key === "ArrowLeft" ? -1 : 1) * (event.shiftKey ? 7 : 1);
        setPlan.mutate({
          item,
          startDate: addDays(item.start, days),
          durationDays: Math.max(1, item.durationDays),
          reason: "move",
        });
      }
      return;
    }
    const step =
      event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
    if (event.key === "Escape" && linkMode) {
      setLinkMode(false);
      setLinkFrom(null);
      return;
    }
    if (!step) return;
    event.preventDefault();
    const next = items[(index.get(item.id) ?? 0) + step];
    if (!next) return;
    setSelectedId(next.id);
    focusNext.current = next.id;
    const element = scroller.current;
    const top = (index.get(next.id) ?? 0) * rowHeight;
    if (
      element &&
      (top < element.scrollTop ||
        top + rowHeight * 2 > element.scrollTop + element.clientHeight)
    )
      element.scrollTop = Math.max(0, top - element.clientHeight / 2);
  };

  // Pointer drags on the chart: move, resize the right edge, or link.
  const pointer = (event: PointerEvent) => {
    const box = chart.current?.getBoundingClientRect();
    return box
      ? { x: event.clientX - box.left, y: event.clientY - box.top }
      : { x: 0, y: 0 };
  };
  const startDrag = (
    event: PointerEvent,
    item: TimelineItem,
    mode: Drag["mode"],
  ) => {
    if (event.button !== 0) return;
    event.stopPropagation();
    if (
      !canEdit ||
      (item.kind === "milestone" && !access.data?.canManageProjects) ||
      setPlan.isPending ||
      saveMilestone.isPending
    ) {
      if (mode === "move") pick(item);
      return;
    }
    chart.current?.setPointerCapture(event.pointerId);
    const at = pointer(event);
    setDrag({
      mode,
      id: item.id,
      pointerId: event.pointerId,
      startX: at.x,
      dx: 0,
      x: at.x,
      y: at.y,
      scale,
    });
  };
  const onMove = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    const at = pointer(event);
    setDrag({ ...drag, dx: at.x - drag.startX, x: at.x, y: at.y });
  };
  const onUp = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    setDrag(null);
    const item = items[index.get(drag.id) ?? -1];
    if (!item) return;
    const at = pointer(event);
    const dx = at.x - drag.startX;
    if (drag.mode === "link") {
      const target = items[Math.floor(at.y / rowHeight)];
      if (target && target.id !== item.id)
        addDependency.add(endOf(item), endOf(target));
      return;
    }
    const days = deltaDays(dx, scale.dayWidth);
    if (drag.mode === "move") {
      if (Math.abs(dx) < 4) {
        pick(item);
        return;
      }
      if (days !== 0)
        setPlan.mutate({
          item,
          startDate: addDays(item.start, days),
          durationDays: Math.max(1, item.durationDays),
          reason: "move",
        });
      return;
    }
    const duration = Math.max(1, item.durationDays + days);
    if (duration !== item.durationDays)
      setPlan.mutate({
        item,
        startDate: item.start,
        durationDays: duration,
        reason: "resize",
      });
  };

  /** A bar's geometry with the live drag applied. */
  const geometry = (item: TimelineItem) => {
    const base = barGeometry(scale, item);
    if (!drag || drag.id !== item.id) return base;
    const days = deltaDays(drag.dx, scale.dayWidth);
    if (drag.mode === "move")
      return { ...base, x: base.x + days * scale.dayWidth };
    if (drag.mode === "resize")
      return {
        ...base,
        width: Math.max(1, item.durationDays + days) * scale.dayWidth,
      };
    return base;
  };
  const centerY = (i: number) => i * rowHeight + rowHeight / 2;
  const visibleIds = new Set(rows.map((item) => item.id));
  const arrows = timeline.dependencies.filter(
    (dep) => visibleIds.has(dep.from.id) || visibleIds.has(dep.to.id),
  );
  const titleOf = (id: string) => items[index.get(id) ?? -1]?.title ?? "";
  const dragSource =
    drag?.mode === "link" ? items[index.get(drag.id) ?? -1] : undefined;
  const risk = timeline.risk;
  const finance = risk.finance;
  const financeSummary = finance?.contractAmount ? (
    <FinanceSummary
      finance={finance}
      delivery={risk.deliveryPercent}
      locale={locale}
      t={t}
    />
  ) : null;

  return (
    <section
      className={`timeline-view${linkMode ? " is-linking" : ""}`}
      data-testid="timeline-view"
      aria-label={t("projects.timelineView")}
    >
      <div className="timeline-toolbar">
        {confirmed && workspace.role !== "guest" && (
          <ViewExportButton
            workspaceId={workspace.id}
            projectId={project.id}
            view="timeline"
            criticalPath={critical ? "show" : "hide"}
          />
        )}
        {access.data?.canManageProjects && (
          <Button
            type="button"
            data-testid="timeline-new-milestone"
            disabled={setPlan.isPending || saveMilestone.isPending}
            onClick={() => {
              saveMilestone.reset();
              setMilestoneDialog({ item: null });
            }}
          >
            <Plus size={16} aria-hidden="true" />
            {t("timeline.newMilestone")}
          </Button>
        )}
        {canManagePhases && (
          <Button type="button" onClick={() => choosePhase(null)}>
            <Plus size={16} aria-hidden="true" />
            {t("timeline.addPhase")}
          </Button>
        )}
        <div
          className="timeline-segment"
          role="group"
          aria-label={t("timeline.zoom")}
        >
          {(["day", "week"] as const).map((value) => (
            <button
              key={value}
              type="button"
              aria-pressed={zoom === value}
              data-testid={`timeline-zoom-${value}`}
              onClick={() => setZoom(value)}
            >
              {t(`timeline.${value}`)}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="timeline-toggle"
          aria-pressed={critical}
          data-testid="timeline-critical"
          onClick={() => setCritical(!critical)}
        >
          <span className="timeline-critical-swatch" aria-hidden="true" />
          {t("timeline.criticalPath")}
        </button>
        {canEdit && (
          <button
            type="button"
            className="timeline-toggle"
            aria-pressed={linkMode}
            data-testid="timeline-link-mode"
            onClick={() => {
              setLinkMode(!linkMode);
              setLinkFrom(null);
            }}
          >
            <span className="timeline-link-swatch" aria-hidden="true" />
            {t("timeline.linkMode")}
          </button>
        )}
        <RiskSummary
          timeline={timeline}
          t={t}
          locale={locale}
          short={dates.short}
        />
        <ProjectHealthUpdates
          key={project.id}
          project={project}
          members={members.data ?? []}
        />
        {desktop && (
          <ul className="timeline-legend" aria-label={t("timeline.legend")}>
            <li>
              <span className="timeline-legend-human" aria-hidden="true" />
              {t("timeline.human")}
            </li>
            <li>
              <span className="timeline-legend-agent" aria-hidden="true" />
              {t("agent")}
            </li>
            <li>
              <span className="timeline-legend-milestone" aria-hidden="true" />
              {t("timeline.milestone")}
            </li>
            <li>
              <span className="timeline-legend-conflict" aria-hidden="true" />
              {t("timeline.conflict")}
            </li>
          </ul>
        )}
      </div>
      {desktop ? (
        <>
          {financeSummary}
          <ProjectFinancePanel project={project} />
        </>
      ) : (
        access.data?.canReadFinance && (
          <>
            <div className="timeline-finance-disclosure">
              {financeSummary}
              <button
                type="button"
                className="timeline-finance-toggle"
                data-testid="timeline-finance-toggle"
                aria-label={t("projectFinance.title")}
                aria-expanded={financeOpen}
                aria-controls={financeId}
                onClick={() =>
                  setOpenFinanceProject(financeOpen ? null : project.id)
                }
              >
                {!financeSummary && t("projectFinance.title")}
                <ChevronDown size={16} aria-hidden="true" />
              </button>
            </div>
            <div id={financeId} hidden={!financeOpen}>
              {financeOpen && <ProjectFinancePanel project={project} />}
            </div>
          </>
        )
      )}
      {linkMode && (
        <div
          className="timeline-link-hint"
          role="status"
          data-testid="timeline-link-hint"
        >
          <span>
            {linkFrom
              ? t("timeline.linkSelected", { task: titleOf(linkFrom.id) })
              : t("timeline.linkHint")}
          </span>
          <button
            type="button"
            className="timeline-text-button"
            onClick={() => {
              setLinkMode(false);
              setLinkFrom(null);
            }}
          >
            {t("timeline.cancel")}
          </button>
        </div>
      )}
      <p className="sr-only" id={hintId}>
        {t("timeline.keyboardHint")}
      </p>
      {phaseQuery.error && (
        <div className="timeline-alert" role="alert">
          <p>{t(errorKey(phaseQuery.error))}</p>
          <Button type="button" onClick={() => void phaseQuery.refetch()}>
            {t("retry")}
          </Button>
        </div>
      )}
      {rowCount === 0 && confirmed && phaseQuery.isPending ? (
        <p className="loading timeline-loading">{t("loading")}</p>
      ) : rowCount === 0 ? (
        <p className="timeline-empty" data-testid="timeline-empty">
          {t("timeline.empty")}
        </p>
      ) : (
        <div
          className="timeline-scroll"
          ref={scroller}
          onScroll={(event) => {
            if (rowCount > 200) {
              setScrollTop(event.currentTarget.scrollTop);
              setViewport(event.currentTarget.clientHeight);
            }
            if (scale.days > DATE_WINDOW_THRESHOLD)
              setHorizontal({
                left: event.currentTarget.scrollLeft,
                width: event.currentTarget.clientWidth,
              });
          }}
        >
          <div
            className="timeline-canvas"
            style={{
              width: labelWidth + chartWidth,
              height: HEADER + rowsHeight,
            }}
          >
            <div className="timeline-header" style={{ height: HEADER }}>
              <div
                className="timeline-header-label"
                style={{ width: labelWidth }}
              >
                {t(
                  phases.length
                    ? "timeline.colTaskOrPhase"
                    : "timeline.colTask",
                )}
              </div>
              <svg
                className="timeline-header-ticks"
                width={chartWidth}
                height={HEADER}
                aria-hidden="true"
              >
                {weeks.map((week) => (
                  <g key={week.date}>
                    <line
                      x1={week.x}
                      x2={week.x}
                      y1={0}
                      y2={20}
                      className="timeline-week-line"
                    />
                    <text x={week.x + 6} y={15} className="timeline-week-label">
                      {dates.short(week.date)}
                    </text>
                  </g>
                ))}
                {zoom === "day" &&
                  days.map((day) => (
                    <text
                      key={day.date}
                      x={day.x + scale.dayWidth / 2}
                      y={36}
                      textAnchor="middle"
                      className={`timeline-day-label${day.date === timeline.today ? " is-today" : ""}`}
                    >
                      {dates.day(day.date)}
                    </text>
                  ))}
                <line
                  x1={todayX + scale.dayWidth / 2}
                  x2={todayX + scale.dayWidth / 2}
                  y1={HEADER - 8}
                  y2={HEADER}
                  className="timeline-today"
                />
              </svg>
            </div>
            <ul
              className="timeline-labels"
              style={{ width: labelWidth, height: rowsHeight }}
              aria-label={t("timeline.rowsLabel", { project: project.name })}
              aria-describedby={hintId}
            >
              {rows.map((item) => {
                const i = index.get(item.id) ?? 0;
                const ref = reference(item);
                return (
                  <li
                    key={item.id}
                    style={{ top: i * rowHeight, height: rowHeight }}
                    className={
                      item.id === selectedId ? "is-selected" : undefined
                    }
                  >
                    <button
                      type="button"
                      ref={(element) => {
                        if (element) rowButtons.current.set(item.id, element);
                        else rowButtons.current.delete(item.id);
                      }}
                      className="timeline-row-label"
                      style={{ paddingLeft: 12 + item.depth * 16 }}
                      aria-pressed={item.id === selectedId}
                      aria-label={rowLabel(item)}
                      data-testid="timeline-row"
                      data-id={item.id}
                      onClick={() => pick(item)}
                      onKeyDown={(event) => moveSelection(event, item)}
                    >
                      {ref && !phone && (
                        <span className="timeline-ref">{ref}</span>
                      )}
                      <span
                        className={`timeline-row-title${item.hasChildren || item.kind === "milestone" ? " is-strong" : ""}`}
                      >
                        {item.title}
                      </span>
                    </button>
                  </li>
                );
              })}
              {phaseRows.map((phase, i) => {
                const top = (items.length + fromPhase + i) * rowHeight;
                const range = phaseRange(phase);
                const label = t("timeline.phaseLabel", {
                  name: phase.name,
                  range,
                });
                const content = (
                  <>
                    <span className="timeline-row-title is-strong">
                      {phase.name}
                    </span>
                    <span className="timeline-phase-range">{range}</span>
                  </>
                );
                return (
                  <li
                    key={phase.id}
                    style={{ top, height: rowHeight }}
                    data-testid="timeline-phase-row"
                  >
                    {canManagePhases ? (
                      <button
                        type="button"
                        className="timeline-row-label timeline-phase-label"
                        aria-label={label}
                        title={label}
                        onClick={() => choosePhase(phase)}
                      >
                        {content}
                      </button>
                    ) : (
                      <div
                        className="timeline-row-label timeline-phase-label"
                        title={label}
                      >
                        {content}
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
            <svg
              ref={chart}
              className="timeline-chart"
              width={chartWidth}
              height={rowsHeight}
              style={{ left: labelWidth, top: HEADER }}
              aria-hidden="true"
              onPointerMove={onMove}
              onPointerUp={onUp}
              onPointerCancel={() => setDrag(null)}
            >
              <defs>
                <marker
                  id={`${hintId}-arrow`}
                  viewBox="0 0 8 8"
                  refX="7"
                  refY="4"
                  markerWidth="6"
                  markerHeight="6"
                  orient="auto"
                >
                  <path d="M0,0L8,4L0,8z" className="timeline-arrow-head" />
                </marker>
              </defs>
              {days
                .filter((day) => day.weekend)
                .map((day) => (
                  <rect
                    key={day.date}
                    x={day.x}
                    y={0}
                    width={scale.dayWidth}
                    height={rowsHeight}
                    className="timeline-weekend"
                  />
                ))}
              {rows.map((item) => {
                const i = index.get(item.id) ?? 0;
                return (
                  <line
                    key={`grid-${item.id}`}
                    x1={0}
                    x2={chartWidth}
                    y1={(i + 1) * rowHeight - 0.5}
                    y2={(i + 1) * rowHeight - 0.5}
                    className="timeline-grid"
                  />
                );
              })}
              {selected && visibleIds.has(selected.id) && (
                <rect
                  x={0}
                  y={(index.get(selected.id) ?? 0) * rowHeight}
                  width={chartWidth}
                  height={rowHeight}
                  className="timeline-selected-row"
                />
              )}
              <line
                x1={todayX + scale.dayWidth / 2}
                x2={todayX + scale.dayWidth / 2}
                y1={0}
                y2={rowsHeight}
                className="timeline-today"
              />
              {arrows.map((dep) => (
                <Arrow
                  key={dep.id}
                  dep={dep}
                  items={items}
                  index={index}
                  geometry={geometry}
                  centerY={centerY}
                  rowHeight={rowHeight}
                  marker={`url(#${hintId}-arrow)`}
                  critical={critical}
                  canEdit={canEdit}
                  label={t("timeline.removeDependency", {
                    from: titleOf(dep.from.id),
                    to: titleOf(dep.to.id),
                  })}
                  onRemove={() => removeDependency.mutate(dep)}
                />
              ))}
              {rows.map((item) => {
                const i = index.get(item.id) ?? 0;
                const { x, width } = geometry(item);
                const cy = centerY(i);
                const meta = [
                  who(item),
                  item.kind === "task" ? `${dates.number(item.progress)}%` : "",
                ]
                  .filter(Boolean)
                  .join(" · ");
                const ring = critical && item.critical;
                const picked = linkFrom?.id === item.id;
                if (item.kind === "milestone")
                  return (
                    <g
                      key={item.id}
                      className={`timeline-milestone${ring ? " is-critical" : ""}${picked ? " is-picked" : ""}`}
                      data-testid="timeline-bar"
                      data-id={item.id}
                      data-start={item.start}
                      data-end={item.end}
                    >
                      <rect
                        x={x - handle / 2}
                        y={cy - rowHeight / 2}
                        width={handle}
                        height={rowHeight}
                        className="timeline-hit"
                        onPointerDown={(event) =>
                          startDrag(event, item, "move")
                        }
                      />
                      <path
                        d={`M${x},${cy - 7}L${x + 7},${cy}L${x},${cy + 7}L${x - 7},${cy}Z`}
                        className="timeline-diamond"
                        pointerEvents="none"
                      />
                      <text
                        x={x + 12}
                        y={cy + 4}
                        className="timeline-meta is-strong"
                      >
                        {dates.short(item.start)}
                      </text>
                    </g>
                  );
                const summary = item.hasChildren;
                const height = summary ? 10 : phone ? 24 : 20;
                const top = cy - height / 2;
                const end = x + width;
                const resizable = canEdit && !summary;
                const label = end + (canEdit ? handle * 2 : 8);
                return (
                  <g
                    key={item.id}
                    className={[
                      "timeline-bar",
                      summary
                        ? "is-summary"
                        : item.workerIsAgent
                          ? "is-agent"
                          : "is-person",
                      item.blocked ? "is-blocked" : "",
                      conflicted.has(item.id) ? "is-conflict" : "",
                      ring ? "is-critical" : "",
                      picked ? "is-picked" : "",
                      drag?.id === item.id ? "is-dragging" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    data-testid="timeline-bar"
                    data-id={item.id}
                    data-start={item.start}
                    data-end={item.end}
                  >
                    {ring && (
                      <rect
                        x={x - 3}
                        y={top - 3}
                        width={width + 6}
                        height={height + 6}
                        className="timeline-ring"
                      />
                    )}
                    <rect
                      x={x}
                      y={top}
                      width={width}
                      height={height}
                      className="timeline-track"
                      data-testid="timeline-bar-body"
                      onPointerDown={(event) => startDrag(event, item, "move")}
                    />
                    <rect
                      x={x}
                      y={top}
                      width={(width * Math.min(100, item.progress)) / 100}
                      height={height}
                      className="timeline-progress"
                      pointerEvents="none"
                    />
                    {resizable && (
                      <rect
                        x={end - handle / 3}
                        y={cy - rowHeight / 2}
                        width={handle}
                        height={rowHeight}
                        className="timeline-hit timeline-resize"
                        data-testid="timeline-bar-resize"
                        onPointerDown={(event) =>
                          startDrag(event, item, "resize")
                        }
                      />
                    )}
                    {canEdit && (
                      <g
                        className="timeline-link-handle"
                        data-testid="timeline-bar-link"
                        onPointerDown={(event) =>
                          startDrag(event, item, "link")
                        }
                      >
                        <rect
                          x={end + (handle * 2) / 3}
                          y={cy - rowHeight / 2}
                          width={handle}
                          height={rowHeight}
                          className="timeline-hit"
                        />
                        <circle
                          cx={end + (handle * 2) / 3 + handle / 2}
                          cy={cy}
                          r={5}
                          className="timeline-link-dot"
                        >
                          <title>{t("timeline.dragLink")}</title>
                        </circle>
                      </g>
                    )}
                    <text x={label} y={cy + 4} className="timeline-meta">
                      {meta}
                      {item.blocked && (
                        <tspan className="timeline-warn">
                          {" "}
                          {t("timeline.blocked")}
                        </tspan>
                      )}
                      {item.behindDays > 0 && !item.blocked && (
                        <tspan className="timeline-warn">
                          {" "}
                          {t("timeline.behind", { count: item.behindDays })}
                        </tspan>
                      )}
                    </text>
                  </g>
                );
              })}
              {dragSource && drag && (
                <line
                  x1={geometry(dragSource).x + geometry(dragSource).width}
                  y1={centerY(index.get(dragSource.id) ?? 0)}
                  x2={drag.x}
                  y2={drag.y}
                  className="timeline-link-preview"
                />
              )}
              {phaseRows.map((phase, i) => {
                const index = items.length + fromPhase + i;
                const x = dateToX(scale, phase.start);
                const width =
                  (daysBetween(phase.start, phase.end) + 1) * scale.dayWidth;
                const cy = centerY(index);
                const bottom = (index + 1) * rowHeight - 0.5;
                const range = phaseRange(phase);
                return (
                  <g key={phase.id}>
                    <line
                      x1={0}
                      x2={chartWidth}
                      y1={bottom}
                      y2={bottom}
                      className="timeline-grid"
                    />
                    <rect
                      data-testid="timeline-phase-bar"
                      data-id={phase.id}
                      data-start={phase.start}
                      data-end={phase.end}
                      x={x}
                      y={cy - 7}
                      width={width}
                      height={14}
                      rx={3}
                      className={`timeline-phase-track${canManagePhases ? " is-editable" : ""}`}
                      onClick={
                        canManagePhases ? () => choosePhase(phase) : undefined
                      }
                    >
                      <title>{range}</title>
                    </rect>
                    <text
                      x={x + width + 8}
                      y={cy + 4}
                      className="timeline-meta"
                    >
                      {range}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      )}
      {selected && (
        <SelectionFooter
          key={`${selected.id}:${selected.start}:${selected.durationDays}:${selected.version}`}
          item={selected}
          timeline={timeline}
          canEdit={
            canEdit &&
            (selected.kind !== "milestone" || !!access.data?.canManageProjects)
          }
          canManageMilestone={!!access.data?.canManageProjects}
          onRename={() => {
            saveMilestone.reset();
            setMilestoneDialog({ item: selected });
          }}
          onArchive={() => {
            saveMilestone.reset();
            setMilestoneDialog({ item: selected, archive: true });
          }}
          reference={reference(selected)}
          projectId={project.id}
          short={dates.short}
          pending={setPlan.isPending || saveMilestone.isPending}
          onClose={() => setSelectedId(null)}
          onSave={(startDate, durationDays) =>
            setPlan.mutate({
              item: selected,
              startDate,
              durationDays,
              reason:
                startDate === selected.start &&
                durationDays !== selected.durationDays
                  ? "resize"
                  : "move",
            })
          }
          onAddPredecessor={(item) =>
            addDependency.add(endOf(item), endOf(selected))
          }
          onRemove={(dep) => removeDependency.mutate(dep)}
          titleOf={titleOf}
          t={t}
        />
      )}
      {milestoneDialog && (
        <MilestoneDialog
          item={milestoneDialog.item}
          archive={!!milestoneDialog.archive}
          today={timeline.today}
          pending={saveMilestone.isPending}
          error={saveMilestone.error}
          onClose={() => setMilestoneDialog(null)}
          onSave={(name, date) =>
            saveMilestone.mutate(
              {
                item: milestoneDialog.item,
                name,
                date,
                archived: milestoneDialog.archive,
              },
              {
                onSuccess: () => {
                  setMilestoneDialog(null);
                  if (milestoneDialog.archive) setSelectedId(null);
                },
              },
            )
          }
        />
      )}
      {canManagePhases && phaseDialog?.projectId === project.id && (
        <ProjectPhaseSheet
          projectId={project.id}
          phase={phaseDialog.phase}
          today={timeline.today}
          onClose={() => setPhaseDialog(null)}
        />
      )}
    </section>
  );
}

function MilestoneDialog({
  item,
  archive,
  today,
  pending,
  error,
  onClose,
  onSave,
}: {
  item: TimelineItem | null;
  archive: boolean;
  today: string;
  pending: boolean;
  error: Error | null;
  onClose: () => void;
  onSave: (name: string, date: string) => void;
}) {
  const { t } = useTranslation();
  const id = useId();
  const [name, setName] = useState(item?.title ?? "");
  const [date, setDate] = useState(item?.start ?? today);
  return (
    <SheetDialog
      title={t(
        archive
          ? "timeline.archiveMilestone"
          : item
            ? "timeline.renameMilestone"
            : "timeline.newMilestone",
      )}
      onClose={onClose}
    >
      <form
        className="timeline-footer-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (name.trim() && date && !pending) onSave(name.trim(), date);
        }}
      >
        {archive ? (
          <p>{t("timeline.archiveMilestoneConfirm", { name })}</p>
        ) : (
          <>
            <div className="field">
              <label htmlFor={`${id}-name`}>
                {t("timeline.milestoneName")}
              </label>
              <input
                className="input"
                id={`${id}-name`}
                data-testid="milestone-name"
                value={name}
                maxLength={200}
                required
                onChange={(event) => setName(event.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor={`${id}-date`}>{t("timeline.date")}</label>
              <input
                className="input"
                id={`${id}-date`}
                data-testid="milestone-date"
                type="date"
                value={date}
                required
                onChange={(event) => setDate(event.target.value)}
              />
            </div>
          </>
        )}
        {error && (
          <p className="alert" role="alert">
            {t(errorKey(error))}
          </p>
        )}
        <Button
          type="submit"
          data-testid="milestone-save"
          className="button-primary"
          disabled={pending || !name.trim() || !date}
        >
          {t(archive ? "timeline.archiveMilestone" : "timeline.apply")}
        </Button>
      </form>
    </SheetDialog>
  );
}

function Arrow({
  dep,
  items,
  index,
  geometry,
  centerY,
  rowHeight,
  marker,
  critical,
  canEdit,
  label,
  onRemove,
}: {
  dep: TimelineDependency;
  items: TimelineItem[];
  index: Map<string, number>;
  geometry: (item: TimelineItem) => { x: number; width: number };
  centerY: (i: number) => number;
  rowHeight: number;
  marker: string;
  critical: boolean;
  canEdit: boolean;
  label: string;
  onRemove: () => void;
}) {
  const fromIndex = index.get(dep.from.id);
  const toIndex = index.get(dep.to.id);
  if (fromIndex === undefined || toIndex === undefined) return null;
  const from = items[fromIndex] as TimelineItem;
  const to = items[toIndex] as TimelineItem;
  const a = geometry(from);
  const b = geometry(to);
  const d = arrowPath(
    { x: a.x + a.width, y: centerY(fromIndex) },
    { x: b.x - (to.kind === "milestone" ? 7 : 0), y: centerY(toIndex) },
    rowHeight,
  );
  const onCritical = critical && from.critical && to.critical;
  return (
    <g
      className={`timeline-arrow${dep.conflict ? " is-conflict" : ""}${onCritical ? " is-critical" : ""}`}
      data-testid="timeline-dependency"
      data-id={dep.id}
      data-from={dep.from.id}
      data-to={dep.to.id}
    >
      <path d={d} className="timeline-arrow-line" markerEnd={marker} />
      {canEdit && !dep.id.startsWith("optimistic:") && (
        <path
          d={d}
          className="timeline-arrow-hit"
          data-testid="timeline-dependency-hit"
          onPointerDown={(event) => event.stopPropagation()}
          onClick={onRemove}
        >
          <title>{label}</title>
        </path>
      )}
    </g>
  );
}

function RiskSummary({
  timeline,
  t,
  locale,
  short,
}: {
  timeline: Timeline;
  t: Translate;
  locale: string;
  short: (date: string) => string;
}) {
  const { risk } = timeline;
  if (!risk.start) return null;
  const percent = new Intl.NumberFormat(locale, { style: "percent" });
  return (
    <div
      className={`timeline-risk is-${risk.level}`}
      data-testid="timeline-risk"
    >
      <span className="timeline-risk-level">
        {t(`timeline.risk.level.${risk.level}`)}
      </span>
      {risk.reasons.length > 0 && (
        <span className="timeline-risk-reasons">
          {risk.reasons
            .map((reason) => t(`timeline.risk.reason.${reason}`))
            .join(" · ")}
        </span>
      )}
      {risk.forecastEnd && (
        <span>
          {t("timeline.forecast")} {short(risk.forecastEnd)}
          {risk.slipDays > 0 &&
            ` (${t("timeline.slip", { count: risk.slipDays })})`}
        </span>
      )}
      <span>
        {t("timeline.delivery")} {percent.format(risk.deliveryPercent / 100)}
      </span>
    </div>
  );
}

function FinanceSummary({
  finance,
  delivery,
  locale,
  t,
}: {
  finance: NonNullable<Timeline["risk"]["finance"]>;
  delivery: number;
  locale: string;
  t: Translate;
}) {
  const money = (amount: string) =>
    finance.currency
      ? new Intl.NumberFormat(locale, {
          style: "currency",
          currency: finance.currency,
        }).format(Number(amount))
      : new Intl.NumberFormat(locale).format(Number(amount));
  const percent = new Intl.NumberFormat(locale, { style: "percent" });
  return (
    <dl className="timeline-finance" data-testid="timeline-finance">
      <div>
        <dt>{t("timeline.finance.amount")}</dt>
        <dd>{money(finance.contractAmount ?? "0")}</dd>
      </div>
      <div>
        <dt>{t("timeline.finance.collected")}</dt>
        <dd>
          {money(finance.collectedAmount)}
          {finance.collectedPercent !== null &&
            ` · ${percent.format(finance.collectedPercent / 100)}`}
        </dd>
      </div>
      <div>
        <dt>{t("timeline.delivery")}</dt>
        <dd>{percent.format(delivery / 100)}</dd>
      </div>
    </dl>
  );
}

/**
 * The keyboard and form alternative to every drag: start, duration and
 * predecessors of the selected row.
 */
function SelectionFooter({
  item,
  timeline,
  canEdit,
  reference,
  canManageMilestone,
  onRename,
  onArchive,
  projectId,
  short,
  pending,
  onClose,
  onSave,
  onAddPredecessor,
  onRemove,
  titleOf,
  t,
}: {
  item: TimelineItem;
  timeline: Timeline;
  canEdit: boolean;
  reference: string | null;
  canManageMilestone: boolean;
  onRename: () => void;
  onArchive: () => void;
  projectId: string;
  short: (date: string) => string;
  pending: boolean;
  onClose: () => void;
  onSave: (startDate: string, durationDays: number) => void;
  onAddPredecessor: (item: TimelineItem) => void;
  onRemove: (dep: TimelineDependency) => void;
  titleOf: (id: string) => string;
  t: Translate;
}) {
  const ids = useId();
  const [start, setStart] = useState(item.start);
  const [duration, setDuration] = useState(
    String(Math.max(1, item.durationDays)),
  );
  const [predecessor, setPredecessor] = useState("");
  const milestone = item.kind === "milestone";
  const parent = shiftsChildren(item);
  const predecessors = timeline.dependencies.filter(
    (dep) => dep.to.id === item.id,
  );
  const taken = new Set(predecessors.map((dep) => dep.from.id));
  const candidates = timeline.items.filter(
    (other) => other.id !== item.id && !taken.has(other.id),
  );
  const days = Number(duration);
  const valid =
    /^\d{4}-\d{2}-\d{2}$/.test(start) &&
    (milestone || (Number.isInteger(days) && days >= 1 && days <= 3650));
  const changed =
    start !== item.start ||
    (!milestone && days !== Math.max(1, item.durationDays));
  return (
    <section
      className="timeline-footer"
      data-testid="timeline-footer"
      aria-labelledby={`${ids}-title`}
    >
      <div className="timeline-footer-head">
        <div>
          {reference && <span className="timeline-ref">{reference}</span>}
          <h2 id={`${ids}-title`}>{item.title}</h2>
          <p className="timeline-footer-dates">
            {milestone
              ? short(item.start)
              : `${short(item.start)} – ${short(item.end)} · ${t("timeline.days", { count: item.durationDays })}`}
            {item.forecastEnd !== item.end &&
              ` · ${t("timeline.forecast")} ${short(item.forecastEnd)}`}
          </p>
        </div>
        <Button
          type="button"
          className="button-quiet"
          aria-label={t("timeline.close")}
          onClick={onClose}
        >
          <X size={18} aria-hidden="true" />
        </Button>
      </div>
      <form
        className="timeline-footer-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (valid && changed) onSave(start, milestone ? 1 : days);
        }}
      >
        <div className="field">
          <label htmlFor={`${ids}-start`}>
            {milestone ? t("timeline.date") : t("timeline.start")}
          </label>
          <input
            id={`${ids}-start`}
            className="input"
            type="date"
            value={start}
            disabled={!canEdit}
            data-testid="timeline-start"
            onChange={(event) => setStart(event.target.value)}
          />
        </div>
        {!milestone && (
          <div className="field">
            <label htmlFor={`${ids}-duration`}>{t("timeline.duration")}</label>
            <input
              id={`${ids}-duration`}
              className="input"
              type="number"
              inputMode="numeric"
              min={1}
              max={3650}
              value={duration}
              disabled={!canEdit || parent}
              aria-describedby={parent ? `${ids}-parent` : undefined}
              data-testid="timeline-duration"
              onChange={(event) => setDuration(event.target.value)}
            />
          </div>
        )}
        {canEdit && (
          <Button
            type="submit"
            className="button-primary"
            disabled={!valid || !changed || pending}
            data-testid="timeline-save"
          >
            {t("timeline.apply")}
          </Button>
        )}
        {parent && (
          <p className="timeline-footer-note" id={`${ids}-parent`}>
            {t("timeline.parentNote")}
          </p>
        )}
      </form>
      <div className="timeline-predecessors">
        <h3>{t("timeline.predecessors")}</h3>
        {predecessors.length === 0 ? (
          <p className="timeline-footer-note">{t("timeline.noPredecessors")}</p>
        ) : (
          <ul>
            {predecessors.map((dep) => (
              <li
                key={dep.id}
                data-testid="timeline-predecessor"
                className={dep.conflict ? "is-conflict" : undefined}
              >
                <span>
                  {titleOf(dep.from.id)}
                  {dep.conflict && (
                    <span className="timeline-warn">
                      {" "}
                      · {t("timeline.conflict")}
                    </span>
                  )}
                </span>
                {canEdit && (
                  <Button
                    type="button"
                    className="button-quiet"
                    disabled={dep.id.startsWith("optimistic:")}
                    aria-label={t("timeline.removePredecessor", {
                      task: titleOf(dep.from.id),
                    })}
                    data-testid="timeline-predecessor-remove"
                    onClick={() => onRemove(dep)}
                  >
                    <X size={16} aria-hidden="true" />
                  </Button>
                )}
              </li>
            ))}
          </ul>
        )}
        {canEdit && candidates.length > 0 && (
          <form
            className="timeline-footer-form"
            onSubmit={(event) => {
              event.preventDefault();
              const chosen = candidates.find(
                (other) => other.id === predecessor,
              );
              if (chosen) {
                onAddPredecessor(chosen);
                setPredecessor("");
              }
            }}
          >
            <div className="field">
              <label htmlFor={`${ids}-predecessor`}>
                {t("timeline.addPredecessor")}
              </label>
              <select
                id={`${ids}-predecessor`}
                value={predecessor}
                data-testid="timeline-add-predecessor"
                onChange={(event) => setPredecessor(event.target.value)}
              >
                <option value="">{t("timeline.choosePredecessor")}</option>
                {candidates.map((other) => (
                  <option key={other.id} value={other.id}>
                    {other.title}
                  </option>
                ))}
              </select>
            </div>
            <Button
              type="submit"
              disabled={!predecessor}
              data-testid="timeline-add-predecessor-submit"
            >
              {t("timeline.add")}
            </Button>
          </form>
        )}
      </div>
      <div className="timeline-footer-links">
        {milestone && canManageMilestone && (
          <>
            <Button
              type="button"
              data-testid="timeline-rename-milestone"
              onClick={onRename}
              disabled={pending}
            >
              <Pencil size={16} aria-hidden="true" />
              {t("timeline.renameMilestone")}
            </Button>
            <Button
              type="button"
              data-testid="timeline-archive-milestone"
              onClick={onArchive}
              disabled={pending}
            >
              <Trash2 size={16} aria-hidden="true" />
              {t("timeline.archiveMilestone")}
            </Button>
          </>
        )}
        {item.kind === "task" && (
          <Link
            href={`/tasks/${item.id}`}
            className="button button-primary"
            data-testid="timeline-open-task"
          >
            <ExternalLink size={16} aria-hidden="true" />
            {t("timeline.openTask")}
          </Link>
        )}
        {item.kind === "task" && (
          <Link
            href={`/projects/${projectId}?view=relations&node=task:${item.id}`}
            className="button"
            data-testid="timeline-show-relations"
          >
            <Network size={16} aria-hidden="true" />
            {t("timeline.showInRelations")}
          </Link>
        )}
        {item.workerIsAgent && (
          <span className="timeline-agent-note">
            <Sparkles size={14} aria-hidden="true" />
            {t("timeline.agentWork")}
          </span>
        )}
      </div>
    </section>
  );
}
