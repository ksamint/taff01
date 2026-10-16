"use client";
// Projects (prototype v2): phone 249–369 (board 260, list 289), desktop
// header and filter bar 1221–1238, board and list 1538–1572.
import "../styles/projects.css";
import {
  projectInputSchema,
  projectUpdateSchema,
  type Run,
  type Task,
  taskReference,
} from "@taff/schemas";
import { useIsMutating } from "@tanstack/react-query";
import {
  ChevronDown,
  GripVertical,
  MoreHorizontal,
  Plus,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { errorKey } from "../lib/api";
import { isLocale } from "../lib/i18n";
import {
  useProjects,
  useTaskAccess,
  useWorkspaceAccess,
} from "../lib/m5-queries";
import { useManageProject, useMoveTaskStatus } from "../lib/mutations/projects";
import { m3MutationKey } from "../lib/optimistic-m3";
import {
  agentShortName,
  filterProjectTasks,
  MORE_VIEWS,
  memberInitials,
  nestByParent,
  PROJECT_STATUSES,
  type ProjectSort,
  type ProjectView,
  parseProjectView,
  sortProjectTasks,
  type TaskFilter,
} from "../lib/project-board";
import { useMembers, useRuns, useTasks } from "../lib/queries";
import { useWorkspace } from "./app-shell";
import { useInitialTodayTime } from "./providers";
import { TimelineView } from "./timeline-view";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { SheetDialog } from "./ui/sheet-dialog";

type Translate = ReturnType<typeof useTranslation>["t"];
// 相關方 (M15) is its own chunk, loaded only for ?view=stakeholders.
const StakeholdersView = dynamic(
  () =>
    import("./crm/stakeholders-view").then((module) => module.StakeholdersView),
  { ssr: false },
);
// Timeline and relations (M16) are their own lazy chunks, like 相關方.
const RelationsView = dynamic(
  () => import("./relations-view").then((module) => module.RelationsView),
  { ssr: false },
);
// The mind map (M18) is its own lazy chunk too.
const MindView = dynamic(
  () => import("./mind-view").then((module) => module.MindView),
  { ssr: false },
);
const PRIORITIES = ["urgent", "high", "medium", "low"] as const;
const VIEW_LABEL: Record<ProjectView, string> = {
  board: "projects.boardView",
  list: "projects.listView",
  timeline: "projects.timelineView",
  stakeholders: "projects.stakeholdersView",
  relations: "projects.relationsView",
  mind: "projects.mindView",
};

function projectDueLabels(locale: string, timeZone: string, now: number) {
  const dayFormat = new Intl.DateTimeFormat("en", {
    timeZone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
  const relativeFormat = new Intl.RelativeTimeFormat(locale, {
    numeric: "auto",
  });
  const dateFormat = new Intl.DateTimeFormat(locale, {
    timeZone,
    month: "short",
    day: "numeric",
  });
  const civilDay = (date: Date) => {
    const parts = dayFormat.formatToParts(date);
    const part = (kind: string) =>
      Number(parts.find((item) => item.type === kind)?.value);
    return Date.UTC(part("year"), part("month") - 1, part("day"));
  };
  const today = civilDay(new Date(now));
  const labels = new Map<string, string>();
  return (dueAt: string): string => {
    const cached = labels.get(dueAt);
    if (cached !== undefined) return cached;
    const due = new Date(dueAt);
    const delta = (civilDay(due) - today) / 86_400_000;
    const label =
      Math.abs(delta) <= 1
        ? relativeFormat.format(delta, "day")
        : dateFormat.format(due);
    const value = label.charAt(0).toLocaleUpperCase(locale) + label.slice(1);
    labels.set(dueAt, value);
    return value;
  };
}

function useDesktop() {
  const [desktop, setDesktop] = useState(false);
  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const sync = () => setDesktop(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  return desktop;
}

/** The prototype's 14 px status mark (`ICON`): ring, half, dot or check. */
function StatusIcon({ status }: { status: Task["status"] }) {
  return (
    <svg
      className={`projects-status-icon projects-status-${status}`}
      width="14"
      height="14"
      viewBox="0 0 14 14"
      aria-hidden="true"
    >
      <circle className="ring" cx="7" cy="7" r="5.75" />
      {status === "in_progress" && (
        <path className="fill" d="M7 3.25A3.75 3.75 0 0 1 7 10.75Z" />
      )}
      {status === "needs_review" && (
        <circle className="fill" cx="7" cy="7" r="2.5" />
      )}
      {status === "done" && (
        <path className="check" d="M4.6 7.2 6.3 8.9 9.5 5.3" />
      )}
    </svg>
  );
}

export function ProjectsView({ projectId = "" }: { projectId?: string }) {
  const { workspace, me, openSearch, openQuick, confirmed } = useWorkspace();
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const desktop = useDesktop();
  const tasks = useTasks(workspace.id);
  const members = useMembers(workspace.id);
  const projects = useProjects(workspace.id);
  const runs = useRuns(workspace.id);
  const workspaceAccess = useWorkspaceAccess(workspace.id);
  const busy = useIsMutating({ mutationKey: m3MutationKey }) > 0;
  const view = parseProjectView(searchParams.get("view"));
  const agentId = searchParams.get("agent");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [activeColumn, setActiveColumn] = useState<Task["status"]>("todo");
  const [filter, setFilter] = useState<TaskFilter>("all");
  const [sort, setSort] = useState<ProjectSort>("created");
  const [label, setLabel] = useState("");
  const [projectDialog, setProjectDialog] = useState<"new" | "edit" | null>(
    null,
  );
  const [projectBaseline, setProjectBaseline] = useState<{
    id: string;
    version: number;
    archived: boolean;
  } | null>(null);
  const [name, setName] = useState("");
  const [invalid, setInvalid] = useState(false);
  const dragHintId = useId();
  const selected = projectId
    ? projects.data?.find((item) => item.id === projectId)
    : searchParams.get("all") === "1"
      ? undefined
      : projects.data
          ?.filter((item) => !item.archived)
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))[0];
  const selectedProjectId = selected?.id ?? projectId;
  const locale = isLocale(i18n.resolvedLanguage) ? i18n.resolvedLanguage : "en";
  const serverNow = useInitialTodayTime();
  const minute = Math.floor(
    (confirmed ? Date.now() : (serverNow ?? Date.now())) / 60_000,
  );
  const dueLabel = useMemo(
    () => projectDueLabels(locale, me.user.tz, minute * 60_000),
    [locale, me.user.tz, minute],
  );
  const projectName = selected ? selected.name : t("projects.allProjects");
  const admin = workspaceAccess.data?.canManageProjects;
  const manage = useManageProject(workspace.id, {
    mode: projectDialog,
    baseline: projectBaseline,
    onSaved: (project) => {
      setProjectDialog(null);
      router.push(`/projects/${project.id}`);
    },
  });
  const { move: moveStatus, edit } = useMoveTaskStatus({
    describe: (status) =>
      t("projects.moved", { status: t(`status.${status}`) }),
    undoLabel: t("actions.undo"),
  });
  const agents = (members.data ?? []).filter((item) => item.kind === "agent");
  const filterAgent = agentId
    ? members.data?.find((item) => item.id === agentId)
    : undefined;
  const visible = sortProjectTasks(
    filterProjectTasks(tasks.data ?? [], {
      projectId: selectedProjectId,
      filter,
      agentId,
      label,
      memberId: workspace.memberId,
      members: members.data ?? [],
    }),
    sort,
    locale,
  );
  const latestRun = (taskId: string) =>
    runs.data
      ?.filter((run) => run.taskId === taskId)
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0];
  /** The current URL with some query parameters set or removed. */
  const hrefWith = (changes: Record<string, string | null>) => {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(changes))
      if (value === null) params.delete(key);
      else params.set(key, value);
    const query = params.toString();
    // The task sheet intercepts /tasks/:id over this view, so build links
    // from the project route rather than the current pathname.
    const base = projectId ? `/projects/${projectId}` : "/projects";
    return query ? `${base}?${query}` : base;
  };
  const viewHref = (next: ProjectView) =>
    hrefWith({ view: next === "board" ? null : next });
  const chooseFilter = (next: TaskFilter | `agent:${string}`) => {
    if (next.startsWith("agent:")) {
      router.replace(hrefWith({ agent: next.slice(6) }), { scroll: false });
      return;
    }
    setFilter(next as TaskFilter);
    if (agentId) router.replace(hrefWith({ agent: null }), { scroll: false });
  };
  const move = (task: Task, status: Task["status"]) => {
    if (task.status === status || busy) return;
    moveStatus(task, status);
  };
  const columns = useRef<HTMLDivElement>(null);
  const [drag, setDrag] = useState<{
    id: string;
    x: number;
    y: number;
    target: Task["status"] | null;
    left: number;
    top: number;
    width: number;
  } | null>(null);
  const dragCleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => dragCleanup.current?.(), []);
  const dragStart = (
    event: React.PointerEvent<HTMLButtonElement>,
    task: Task,
    allowed: Task["status"][],
  ) => {
    if (busy || event.button !== 0 || !allowed.length) return;
    event.preventDefault();
    dragCleanup.current?.();
    const board = columns.current;
    const handle = event.currentTarget;
    const pointerId = event.pointerId;
    const startX = event.clientX,
      startY = event.clientY;
    const sourceRect = handle.closest("li")!.getBoundingClientRect();
    let x = startX,
      y = startY,
      moved = false,
      frame = 0;
    const targetAt = (pointX: number, pointY: number) =>
      Array.from(
        board?.querySelectorAll<HTMLElement>("[data-board-status]") ?? [],
      ).find((column) => {
        const rect = column.getBoundingClientRect();
        return (
          pointX >= rect.left &&
          pointX <= rect.right &&
          pointY >= rect.top &&
          pointY <= rect.bottom
        );
      })?.dataset.boardStatus as Task["status"] | undefined;
    const update = () => {
      const target = targetAt(x, y);
      setDrag({
        id: task.id,
        x: x - startX,
        left: sourceRect.left + x - startX,
        top: sourceRect.top + y - startY,
        width: sourceRect.width,
        y: y - startY,
        target: target && allowed.includes(target) ? target : null,
      });
    };
    const scroll = () => {
      if (moved && board) {
        const rect = board.getBoundingClientRect();
        if (y >= rect.top && y <= rect.bottom) {
          const left = Math.max(0, rect.left),
            right = Math.min(window.innerWidth, rect.right);
          const delta =
            x < left + 44
              ? -Math.min(12, (left + 44 - x) / 3)
              : x > right - 44
                ? Math.min(12, (x - right + 44) / 3)
                : 0;
          if (delta) {
            board.scrollLeft += delta;
            update();
          }
        }
      }
      frame = requestAnimationFrame(scroll);
    };
    const pointerMove = (current: PointerEvent) => {
      if (current.pointerId !== pointerId) return;
      x = current.clientX;
      y = current.clientY;
      moved = true;
      update();
    };
    const cleanup = () => {
      cancelAnimationFrame(frame);
      handle.removeEventListener("pointermove", pointerMove);
      handle.removeEventListener("pointerup", finish);
      handle.removeEventListener("pointercancel", finish);
      handle.removeEventListener("lostpointercapture", cancel);
      window.removeEventListener("blur", cancel);
      if (handle.hasPointerCapture(pointerId))
        handle.releasePointerCapture(pointerId);
    };
    const cancel = () => {
      cleanup();
      dragCleanup.current = null;
      setDrag(null);
    };
    const finish = (current: PointerEvent) => {
      if (current.pointerId !== pointerId) return;
      cleanup();
      dragCleanup.current = null;
      setDrag(null);
      if (moved && current.type === "pointerup") {
        const target = targetAt(current.clientX, current.clientY);
        if (target && allowed.includes(target)) move(task, target);
      }
    };
    dragCleanup.current = cleanup;
    handle.setPointerCapture(pointerId);
    handle.addEventListener("pointermove", pointerMove);
    handle.addEventListener("pointerup", finish);
    handle.addEventListener("pointercancel", finish);
    handle.addEventListener("lostpointercapture", cancel);
    window.addEventListener("blur", cancel);
    frame = requestAnimationFrame(scroll);
  };
  const filterValue = agentId ? `agent:${agentId}` : filter;
  const cardProps = {
    reference: (task: Task) => taskReference(workspace.key, task.number),
    due: (task: Task) => (task.dueAt ? dueLabel(task.dueAt) : ""),
    member: (id: string | null) =>
      id ? members.data?.find((item) => item.id === id) : undefined,
    parent: (task: Task) =>
      task.parentId
        ? tasks.data?.find((item) => item.id === task.parentId)
        : undefined,
    children: (task: Task) =>
      tasks.data?.filter((item) => item.parentId === task.id) ?? [],
    latestRun,
    selectedPath: pathname,
  };
  const showFilters = view === "board" || view === "list";
  return (
    <div className={`projects-view projects-view-${view}`}>
      <header className="projects-header">
        <Link className="projects-org" href="/orgs">
          {workspace.name}
          <ChevronDown size={12} aria-hidden="true" />
        </Link>
        <nav className="projects-sections" aria-label={t("projects.sections")}>
          <Link
            className="projects-section is-active"
            href="/projects"
            aria-current="page"
            data-testid="crm-section-projects"
          >
            {t("projects.title")}
          </Link>
          {workspaceAccess.data?.canReadCrm &&
            (["companies", "contacts"] as const).map((section) => (
              <Link
                key={section}
                className="projects-section"
                href={`/${section}`}
                prefetch={false}
                data-testid={`crm-section-${section}`}
              >
                {t(`crm.${section}.title`)}
              </Link>
            ))}
        </nav>
        <div className="projects-title-row">
          <span className="projects-crumb" aria-hidden="true">
            {t("projects.title")}
            <span className="projects-crumb-separator">/</span>
          </span>
          <h1 className="projects-title">
            <button
              type="button"
              className="projects-title-button"
              data-testid="project-filters"
              aria-haspopup="dialog"
              onClick={() => setSheetOpen(true)}
            >
              <span className="projects-title-text">{projectName}</span>
              <span className="sr-only"> · {t("projects.switchProject")}</span>
              <ChevronDown size={16} aria-hidden="true" />
            </button>
          </h1>
          <div className="projects-title-actions">
            <nav className="projects-views" aria-label={t("projects.views")}>
              <span className="projects-segment">
                {(["board", "list", "timeline"] as const).map((mode) => (
                  <Link
                    key={mode}
                    className={`projects-view-tab${view === mode ? " is-active" : ""}`}
                    data-testid={`project-view-${mode}`}
                    href={viewHref(mode)}
                    aria-current={view === mode ? "page" : undefined}
                    replace
                    scroll={false}
                  >
                    {t(VIEW_LABEL[mode])}
                  </Link>
                ))}
              </span>
              <MoreViews view={view} href={viewHref} t={t} />
            </nav>
            <Button
              className="projects-search button-quiet"
              data-testid="open-search"
              aria-label={t("search.title")}
              onClick={openSearch}
            >
              <Search size={20} aria-hidden="true" />
            </Button>
            {workspaceAccess.data?.canCreateTasks && (
              <Button
                className="projects-new-task button-primary"
                data-testid="desktop-new-task"
                onClick={openQuick}
              >
                <Plus size={16} strokeWidth={1.5} aria-hidden="true" />
                {t("quickAdd.newTask")}
              </Button>
            )}
          </div>
        </div>
      </header>
      {showFilters && (
        <div className="projects-filter-bar">
          {filterAgent && (
            <button
              type="button"
              className="projects-agent-filter"
              aria-label={t("projects.clearAgentFilter", {
                name: filterAgent.name,
              })}
              onClick={() => chooseFilter("all")}
            >
              <Sparkles size={12} aria-hidden="true" />
              {filterAgent.name}
              <X size={12} aria-hidden="true" />
            </button>
          )}
          <div
            className="projects-filter-chips"
            role="group"
            aria-label={t("projects.filter")}
          >
            {(["all", "agents", "mine"] as const).map((value) => (
              <button
                type="button"
                key={value}
                aria-pressed={!agentId && filter === value}
                onClick={() => chooseFilter(value)}
              >
                {t(
                  value === "all" ? "projects.filterAll" : `projects.${value}`,
                )}
              </button>
            ))}
          </div>
        </div>
      )}
      {view === "board" && (
        <div
          className="projects-status-tabs"
          role="group"
          aria-label={t("projects.statusTabs")}
        >
          {PROJECT_STATUSES.map((status) => (
            <button
              type="button"
              key={status}
              aria-pressed={activeColumn === status}
              onClick={() => {
                setActiveColumn(status);
                const column = columns.current?.querySelector<HTMLElement>(
                  `[data-board-status="${status}"]`,
                );
                if (column && columns.current)
                  columns.current.scrollTo({
                    left: column.offsetLeft - columns.current.offsetLeft - 20,
                    behavior: "smooth",
                  });
              }}
            >
              <StatusIcon status={status} />
              {t(`status.${status}`)}
              <span className="projects-count">
                {visible.filter((task) => task.status === status).length}
              </span>
            </button>
          ))}
        </div>
      )}
      {sheetOpen && (
        <SheetDialog
          title={t("projects.switchProject")}
          onClose={() => setSheetOpen(false)}
        >
          <div className="planning-toolbar">
            <div className="field">
              <Label htmlFor="project-select">{t("planning.project")}</Label>
              <select
                id="project-select"
                data-testid="project-select"
                value={selectedProjectId}
                onChange={(event) =>
                  router.push(
                    event.target.value
                      ? `/projects/${event.target.value}`
                      : "/projects?all=1",
                  )
                }
              >
                <option value="">{t("projects.allProjects")}</option>
                {projects.data?.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                    {project.archived ? ` · ${t("projects.archived")}` : ""}
                  </option>
                ))}
              </select>
            </div>
            {admin && (
              <Button
                data-testid="new-project"
                onClick={() => {
                  setName("");
                  setSheetOpen(false);
                  setProjectDialog("new");
                }}
              >
                {t("projects.newProject")}
              </Button>
            )}
            {admin && selected && (
              <Button
                onClick={() => {
                  setSheetOpen(false);
                  setProjectBaseline({
                    id: selected.id,
                    version: selected.version,
                    archived: selected.archived,
                  });
                  setName(selected.name);
                  setProjectDialog("edit");
                }}
              >
                {t("projects.manage")}
              </Button>
            )}
          </div>
          <div className="planning-toolbar">
            <div className="field">
              <Label htmlFor="project-filter">{t("projects.filter")}</Label>
              <select
                id="project-filter"
                data-testid="project-filter"
                value={filterValue}
                onChange={(event) =>
                  chooseFilter(event.target.value as TaskFilter)
                }
              >
                <option value="all">{t("projects.allTasks")}</option>
                <option value="mine">{t("projects.mine")}</option>
                <option value="agents">{t("projects.agents")}</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={`agent:${agent.id}`}>
                    {agent.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <Label htmlFor="project-sort">{t("projects.sort")}</Label>
              <select
                id="project-sort"
                data-testid="project-sort"
                value={sort}
                onChange={(event) => setSort(event.target.value as ProjectSort)}
              >
                {(["created", "due", "priority", "title"] as const).map(
                  (key) => (
                    <option key={key} value={key}>
                      {t(`projects.sort${key[0].toUpperCase()}${key.slice(1)}`)}
                    </option>
                  ),
                )}
              </select>
            </div>
            <div className="field">
              <Label htmlFor="project-label">{t("projects.labelFilter")}</Label>
              <Input
                id="project-label"
                data-testid="project-label"
                value={label}
                onChange={(event) => setLabel(event.target.value)}
              />
            </div>
          </div>
        </SheetDialog>
      )}
      <p className="sr-only" id={dragHintId}>
        {t("projects.dragHint")}
      </p>
      {tasks.isError || projects.isError || edit.isError ? (
        <p className="alert projects-alert" role="alert">
          {t(errorKey(tasks.error ?? projects.error ?? edit.error))}
        </p>
      ) : null}
      {projects.isPending && view !== "board" && view !== "list" ? (
        <p className="loading projects-loading">{t("loading")}</p>
      ) : view === "stakeholders" ? (
        <StakeholdersView workspaceId={workspace.id} project={selected} />
      ) : view === "timeline" ? (
        <TimelineView project={selected} />
      ) : view === "relations" ? (
        <RelationsView project={selected} />
      ) : view === "mind" ? (
        <MindView project={selected} />
      ) : tasks.isPending ? (
        <p className="loading projects-loading">{t("loading")}</p>
      ) : view === "list" ? (
        desktop ? (
          <DesktopList tasks={visible} t={t} {...cardProps} />
        ) : (
          <div className="planning-list projects-list">
            {PROJECT_STATUSES.map((status) => {
              const items = visible.filter((task) => task.status === status);
              if (!items.length) return null;
              return (
                <section
                  key={status}
                  data-board-status={status}
                  data-testid={`board-column-${status}`}
                  className="projects-list-group"
                  aria-labelledby={`projects-group-${status}`}
                >
                  <h2
                    className="projects-list-group-heading"
                    id={`projects-group-${status}`}
                  >
                    <StatusIcon status={status} />
                    {t(`status.${status}`)}
                    <span className="projects-count">{items.length}</span>
                  </h2>
                  <ul className="projects-list-rows">
                    {nestByParent(items).map(({ task }) => (
                      <ListRow key={task.id} task={task} t={t} {...cardProps} />
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        )
      ) : (
        <div
          ref={columns}
          className={`planning-board${drag ? " is-board-dragging" : ""}`}
          onScroll={() => {
            if (!columns.current) return;
            const board = columns.current;
            const nearest = [
              ...board.querySelectorAll<HTMLElement>("[data-board-status]"),
            ].sort(
              (a, b) =>
                Math.abs(
                  a.offsetLeft - board.offsetLeft - board.scrollLeft - 20,
                ) -
                Math.abs(
                  b.offsetLeft - board.offsetLeft - board.scrollLeft - 20,
                ),
            )[0];
            const status = nearest?.dataset.boardStatus;
            if (PROJECT_STATUSES.includes(status as Task["status"]))
              setActiveColumn(status as Task["status"]);
          }}
        >
          {PROJECT_STATUSES.map((status) => {
            const items = visible.filter((task) => task.status === status);
            return (
              <section
                key={status}
                data-board-status={status}
                data-testid={`board-column-${status}`}
                className={`projects-column${drag?.target === status ? " is-drop-target" : ""}`}
                aria-labelledby={`projects-column-${status}`}
              >
                <h2
                  className="projects-column-heading"
                  id={`projects-column-${status}`}
                >
                  <StatusIcon status={status} />
                  {t(`status.${status}`)}
                  <span className="projects-count">{items.length}</span>
                </h2>
                {!items.length ? (
                  <p className="projects-column-empty">
                    <span aria-hidden="true">—</span>
                    <span className="sr-only">{t("projects.empty")}</span>
                  </p>
                ) : (
                  <ul className="projects-cards">
                    {items.map((task) => (
                      <BoardCard
                        key={task.id}
                        task={task}
                        t={t}
                        {...cardProps}
                        busy={busy}
                        move={move}
                        dragStart={dragStart}
                        dragging={drag?.id === task.id}
                        dragHintId={dragHintId}
                      />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}
      {drag &&
        createPortal(
          <div
            aria-hidden="true"
            className="task-card drag-preview projects-drag-preview"
            style={{ left: drag.left, top: drag.top, width: drag.width }}
          >
            <span className="projects-task-reference">
              {t("projects.drag")}
            </span>
            <h3>{visible.find((task) => task.id === drag.id)?.title ?? ""}</h3>
          </div>,
          document.body,
        )}
      {projectDialog && (
        <SheetDialog
          title={t(
            projectDialog === "new" ? "projects.newProject" : "projects.manage",
          )}
          onClose={() => {
            if (!busy) setProjectDialog(null);
          }}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const parsed =
                projectDialog === "new"
                  ? projectInputSchema.safeParse({ name })
                  : projectUpdateSchema.safeParse({
                      version: projectBaseline?.version,
                      name,
                    });
              setInvalid(!parsed.success);
              if (parsed.success) manage.mutate(parsed.data);
            }}
          >
            <div className="field">
              <Label htmlFor="project-name">{t("projects.projectName")}</Label>
              <Input
                id="project-name"
                data-testid="project-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={100}
                autoFocus
              />
            </div>
            <Button
              data-testid="project-submit"
              type="submit"
              disabled={busy || !name.trim()}
              className="button-primary"
            >
              {t("planning.save")}
            </Button>
            {selected && projectDialog === "edit" && (
              <Button
                type="button"
                disabled={busy}
                onClick={() =>
                  manage.mutate({
                    version: projectBaseline!.version,
                    archived: !projectBaseline!.archived,
                  })
                }
              >
                {t(selected.archived ? "projects.restore" : "projects.archive")}
              </Button>
            )}
            {(invalid || manage.isError) && (
              <p className="alert" role="alert">
                {t(invalid ? "errors.invalid_input" : errorKey(manage.error))}
              </p>
            )}
          </form>
        </SheetDialog>
      )}
    </div>
  );
}

/** 更多 ›: 相關方 · 關係圖 · 心智圖 (prototype `moreMenu`). */
function MoreViews({
  view,
  href,
  t,
}: {
  view: ProjectView;
  href: (view: ProjectView) => string;
  t: Translate;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const menuId = useId();
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      root.current?.querySelector("button")?.focus();
    };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);
  const active = (MORE_VIEWS as readonly string[]).includes(view);
  return (
    <div
      className="projects-more"
      ref={root}
      onBlur={(event) => {
        if (!root.current?.contains(event.relatedTarget as Node | null))
          setOpen(false);
      }}
    >
      <button
        type="button"
        className={`projects-view-tab projects-more-toggle${active ? " is-active" : ""}`}
        data-testid="project-view-more"
        aria-expanded={open}
        aria-controls={menuId}
        onClick={() => setOpen(!open)}
      >
        {t(active ? VIEW_LABEL[view] : "projects.moreViews")}
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      {open && (
        <ul className="projects-more-menu" id={menuId}>
          {MORE_VIEWS.map((item) => (
            <li key={item}>
              <Link
                href={href(item)}
                data-testid={`project-view-${item}`}
                aria-current={view === item ? "page" : undefined}
                replace
                scroll={false}
                onClick={() => setOpen(false)}
              >
                {t(VIEW_LABEL[item])}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

type CardData = {
  t: Translate;
  reference: (task: Task) => string;
  due: (task: Task) => string;
  member: (id: string | null) => { name: string; kind: string } | undefined;
  parent: (task: Task) => Task | undefined;
  children: (task: Task) => Task[];
  latestRun: (taskId: string) => Run | undefined;
  selectedPath: string;
};

/** Title link for a card or row; its ::after makes the whole item a target. */
function TaskLink({ task }: { task: Task }) {
  return task.id.startsWith("optimistic:") ? (
    <span className="task-title-link" aria-busy="true">
      {task.title}
    </span>
  ) : (
    <Link
      className="task-title-link"
      href={`/tasks/${task.id}`}
      prefetch={false}
    >
      {task.title}
    </Link>
  );
}

function AgentChip({
  name,
  run,
  t,
  withState,
}: {
  name: string;
  run?: Run;
  t: Translate;
  withState: boolean;
}) {
  return (
    <span className="projects-agent-chip">
      <Sparkles size={12} aria-hidden="true" />
      {agentShortName(name)}
      {run && (
        <>
          <span
            className={`projects-agent-dot run-${run.status}`}
            title={t(`run.status.${run.status}`)}
          />
          {withState && (
            <span className="projects-agent-state">
              {t(`run.status.${run.status}`)}
            </span>
          )}
        </>
      )}
    </span>
  );
}

function Avatar({ name, t }: { name: string; t: Translate }) {
  return (
    <span
      className="projects-owner-avatar"
      title={name}
      role="img"
      aria-label={t("ownedBy", { name })}
    >
      {memberInitials(name)}
    </span>
  );
}

function BoardCard({
  task,
  t,
  reference,
  due,
  member,
  parent: parentOf,
  children: childrenOf,
  latestRun,
  selectedPath,
  busy,
  move,
  dragStart,
  dragging,
  dragHintId,
}: CardData & {
  task: Task;
  busy: boolean;
  move: (task: Task, status: Task["status"]) => void;
  dragStart: (
    event: React.PointerEvent<HTMLButtonElement>,
    task: Task,
    allowed: Task["status"][],
  ) => void;
  dragging: boolean;
  dragHintId: string;
}) {
  const access = useTaskAccess(task.id);
  const allowed = access.data?.allowedStatuses ?? [];
  const owner = member(task.ownerId);
  const worker = member(task.workerId);
  const ownerName = owner ? owner.name : t("unknownMember");
  const parent = parentOf(task);
  const children = childrenOf(task);
  const completed = children.filter((item) => item.status === "done").length;
  const run = worker?.kind === "agent" ? latestRun(task.id) : undefined;
  const dueLabel = due(task);
  return (
    <li
      className={`task-card board-card${task.parentId ? " is-child" : ""}${selectedPath === `/tasks/${task.id}` ? " is-selected" : ""}${dragging ? " is-dragging" : ""}`}
      data-testid="board-task"
      data-task-id={task.id}
    >
      <div className="projects-card-top">
        <span className="projects-task-reference">{reference(task)}</span>
        <span
          className="task-due"
          aria-label={dueLabel ? undefined : t("taskDetail.unscheduled")}
        >
          {dueLabel}
        </span>
      </div>
      <h3 className="projects-card-title">
        <TaskLink task={task} />
      </h3>
      {task.parentId && (
        <p className="projects-parent">
          <span aria-hidden="true">↳</span>
          <span className="projects-parent-text">
            <span className="projects-parent-ref">
              {parent ? reference(parent) : t("planning.parent")}
            </span>
            {parent && (
              <span className="projects-parent-title"> {parent.title}</span>
            )}
          </span>
        </p>
      )}
      {children.length > 0 && (
        <div className="projects-subtasks">
          <span className="projects-subtask-track" aria-hidden="true">
            <span
              style={{ width: `${(completed / children.length) * 100}%` }}
            />
          </span>
          <span>
            <span className="projects-subtasks-label">
              {t("planning.subtasks")}{" "}
            </span>
            {completed}/{children.length}
          </span>
        </div>
      )}
      <div className="projects-card-footer">
        <Avatar name={ownerName} t={t} />
        {worker && worker.kind !== "agent" && worker !== owner && (
          <Avatar name={worker.name} t={t} />
        )}
        {worker?.kind === "agent" && (
          <>
            <AgentChip name={worker.name} run={run} t={t} withState />
            {run && (
              <span className="projects-agent-state-desktop">
                {t(`run.status.${run.status}`)}
              </span>
            )}
          </>
        )}
      </div>
      <div className="board-card-bottom">
        <Button
          data-testid="drag-handle"
          className="button-quiet drag-handle"
          disabled={busy || !allowed.length}
          aria-label={t("projects.drag")}
          aria-describedby={dragHintId}
          onPointerDown={(event) => dragStart(event, task, allowed)}
        >
          <GripVertical size={16} aria-hidden="true" />
        </Button>
        <details className="projects-card-menu">
          <summary aria-label={t("planning.status")}>
            <MoreHorizontal size={16} aria-hidden="true" />
          </summary>
          <div className="projects-card-menu-body">
            <select
              data-testid="board-status"
              aria-label={t("planning.status")}
              disabled={busy || !allowed.length}
              value={task.status}
              onChange={(event) =>
                move(task, event.target.value as Task["status"])
              }
            >
              {[...new Set([task.status, ...allowed])].map((status) => (
                <option key={status} value={status}>
                  {t(`status.${status}`)}
                </option>
              ))}
            </select>
            <span className="projects-card-priority">
              {t(`planning.${PRIORITIES[task.priority - 1]}`)}
            </span>
          </div>
        </details>
      </div>
    </li>
  );
}

/** Phone list row (prototype 297–304). */
function ListRow({
  task,
  t,
  reference,
  due,
  member,
  children: childrenOf,
  latestRun,
  selectedPath,
}: CardData & { task: Task }) {
  const owner = member(task.ownerId);
  const worker = member(task.workerId);
  const children = childrenOf(task);
  const completed = children.filter((item) => item.status === "done").length;
  return (
    <li
      className={`projects-list-row${task.parentId ? " is-child" : ""}${selectedPath === `/tasks/${task.id}` ? " is-selected" : ""}`}
      data-testid="board-task"
      data-task-id={task.id}
    >
      {task.parentId && (
        <span className="projects-row-child" aria-hidden="true">
          ↳
        </span>
      )}
      <StatusIcon status={task.status} />
      <span className="projects-row-copy">
        <span className="projects-row-title">
          <TaskLink task={task} />
        </span>
        <span className="projects-row-meta">
          <span className="projects-task-reference">{reference(task)}</span>
          <span>{due(task)}</span>
          {children.length > 0 && (
            <span>
              · {t("planning.subtasks")} {completed}/{children.length}
            </span>
          )}
        </span>
      </span>
      {worker?.kind === "agent" && (
        <AgentChip
          name={worker.name}
          run={latestRun(task.id)}
          t={t}
          withState={false}
        />
      )}
      <Avatar name={owner ? owner.name : t("unknownMember")} t={t} />
    </li>
  );
}

/** Desktop table list (prototype 1561–1571). */
function DesktopList({
  tasks,
  t,
  reference,
  due,
  member,
  children: childrenOf,
  latestRun,
  selectedPath,
}: CardData & { tasks: Task[] }) {
  return (
    <table className="planning-list projects-table">
      <thead>
        <tr>
          <th scope="col">{t("search.tasks")}</th>
          <th scope="col">{t("worker")}</th>
          <th scope="col">{t("taskDetail.due")}</th>
          <th scope="col">{t("planning.priority")}</th>
        </tr>
      </thead>
      <tbody>
        {nestByParent(tasks).map(({ task, nested }) => {
          const owner = member(task.ownerId);
          const worker = member(task.workerId);
          const children = childrenOf(task);
          const completed = children.filter(
            (item) => item.status === "done",
          ).length;
          const run = worker?.kind === "agent" ? latestRun(task.id) : undefined;
          return (
            <tr
              key={task.id}
              className={`projects-table-row${nested ? " is-child" : ""}${selectedPath === `/tasks/${task.id}` ? " is-selected" : ""}`}
              data-testid="board-task"
              data-task-id={task.id}
            >
              <td>
                <span className="projects-table-task">
                  {nested && (
                    <span className="projects-row-child" aria-hidden="true">
                      ↳
                    </span>
                  )}
                  <StatusIcon status={task.status} />
                  <span className="sr-only">{t(`status.${task.status}`)}</span>
                  <span className="projects-task-reference">
                    {reference(task)}
                  </span>
                  <span className="projects-table-title">
                    <TaskLink task={task} />
                  </span>
                  {children.length > 0 && (
                    <span className="projects-table-subtasks">
                      {completed}/{children.length}
                    </span>
                  )}
                </span>
              </td>
              <td>
                {worker?.kind === "agent" ? (
                  <span className="projects-table-agent">
                    <Sparkles size={12} aria-hidden="true" />
                    {agentShortName(worker.name)}
                    {run && (
                      <span
                        className={`projects-agent-dot run-${run.status}`}
                        title={t(`run.status.${run.status}`)}
                      />
                    )}
                  </span>
                ) : (
                  (worker ?? owner)?.name
                )}
              </td>
              <td>{due(task)}</td>
              <td>{t(`planning.${PRIORITIES[task.priority - 1]}`)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
