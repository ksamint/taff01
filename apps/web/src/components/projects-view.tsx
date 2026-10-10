"use client";
import {
  type Project,
  type ProjectInput,
  type ProjectUpdate,
  projectInputSchema,
  projectSchema,
  projectUpdateSchema,
  type Task,
} from "@taff/schemas";
import {
  useIsMutating,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { GripVertical, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { errorKey, request } from "../lib/api";
import { invalidateM3 } from "../lib/m3-queries";
import {
  projectsKey,
  useEditTask,
  useProjects,
  useTaskAccess,
  useWorkspaceAccess,
} from "../lib/m5-queries";
import { m3MutationKey, snapshotM3 } from "../lib/optimistic-m3";
import { useMembers, useTasks } from "../lib/queries";
import { isCurrentSnapshot, restoreQueries } from "../lib/query-snapshot";
import { useWorkspace } from "./app-shell";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { SheetDialog } from "./ui/sheet-dialog";

const STATUSES: Task["status"][] = [
  "todo",
  "in_progress",
  "needs_review",
  "done",
];

export function ProjectsView({ projectId = "" }: { projectId?: string }) {
  const { workspace, openSearch } = useWorkspace();
  const { t, i18n } = useTranslation();
  const router = useRouter();
  const client = useQueryClient();
  const tasks = useTasks(workspace.id);
  const members = useMembers(workspace.id);
  const projects = useProjects(workspace.id);
  const edit = useEditTask();
  const busy = useIsMutating({ mutationKey: m3MutationKey }) > 0;
  const [view, setView] = useState<"board" | "list">("board");
  const [filter, setFilter] = useState("all");
  const [sort, setSort] = useState("created");
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
  const [announcement, setAnnouncement] = useState("");
  const selected = projects.data?.find((item) => item.id === projectId);
  const workspaceAccess = useWorkspaceAccess(workspace.id);
  const admin = workspaceAccess.data?.canManageProjects;
  const manage = useMutation({
    mutationKey: m3MutationKey,
    mutationFn: (body: ProjectInput | ProjectUpdate) =>
      request(
        projectDialog === "new"
          ? `/api/projects?workspaceId=${workspace.id}`
          : `/api/projects/${projectBaseline?.id}`,
        {
          method: projectDialog === "new" ? "POST" : "PATCH",
          body: JSON.stringify(body),
        },
      ).then(projectSchema.parse),
    onMutate: async (body) => {
      const snapshot = await snapshotM3(client);
      const id =
        projectDialog === "edit"
          ? projectBaseline!.id
          : `optimistic:${crypto.randomUUID()}`;
      const now = new Date().toISOString();
      client.setQueryData<Project[]>(
        projectsKey(workspace.id),
        (current = []) =>
          projectDialog === "new"
            ? [
                ...current,
                {
                  id,
                  workspaceId: workspace.id,
                  name: body.name!,
                  archived: false,
                  version: 1,
                  createdAt: now,
                  updatedAt: now,
                },
              ]
            : current.map((item) =>
                item.id === id ? { ...item, ...body } : item,
              ),
      );
      return { snapshot, id };
    },
    onError: (_, __, context) => restoreQueries(client, context?.snapshot),
    onSuccess: (project, _, context) => {
      if (!isCurrentSnapshot(client, context.snapshot)) return;
      client.setQueryData<Project[]>(projectsKey(workspace.id), (current) =>
        current?.map((item) => (item.id === context.id ? project : item)),
      );
      setProjectDialog(null);
      router.push(`/projects/${project.id}`);
    },
    onSettled: () => invalidateM3(client),
  });
  const visible = (tasks.data ?? [])
    .filter(
      (task) =>
        (!projectId || task.projectId === projectId) &&
        (!label ||
          task.labels.some((item) =>
            item.toLocaleLowerCase().includes(label.toLocaleLowerCase()),
          )) &&
        (filter === "all" ||
          (filter === "mine"
            ? task.ownerId === workspace.memberId
            : members.data?.find((member) => member.id === task.workerId)
                ?.kind === "agent")),
    )
    .sort((a, b) =>
      sort === "priority"
        ? a.priority - b.priority
        : sort === "due"
          ? (a.dueAt ?? "9999").localeCompare(b.dueAt ?? "9999")
          : sort === "title"
            ? a.title.localeCompare(b.title, i18n.resolvedLanguage)
            : b.createdAt.localeCompare(a.createdAt),
    );
  const move = (task: Task, status: Task["status"]) => {
    if (task.status === status || busy) return;
    edit.mutate(
      { id: task.id, body: { version: task.version, status } },
      {
        onSuccess: () =>
          setAnnouncement(
            t("projects.moved", { status: t(`status.${status}`) }),
          ),
      },
    );
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
  return (
    <>
      <section className="page-heading">
        <Link className="eyebrow text-link" href="/orgs">
          {workspace.name}
        </Link>
        <h1>{selected?.name ?? t("projects.title")}</h1>
        <div className="screen-header-actions">
          <Button
            className="button-quiet"
            data-testid="open-search"
            aria-label={t("search.title")}
            onClick={openSearch}
          >
            <Search size={20} aria-hidden="true" />
          </Button>
        </div>
      </section>
      <div className="planning-toolbar">
        <div className="field">
          <Label htmlFor="project-select">{t("planning.project")}</Label>
          <select
            id="project-select"
            data-testid="project-select"
            value={projectId}
            onChange={(event) =>
              router.push(
                event.target.value
                  ? `/projects/${event.target.value}`
                  : "/projects",
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
        <div
          className="segmented"
          role="group"
          aria-label={t("projects.title")}
        >
          {(["board", "list"] as const).map((mode) => (
            <button
              key={mode}
              data-testid={`project-view-${mode}`}
              type="button"
              aria-pressed={view === mode}
              onClick={() => setView(mode)}
            >
              {t(`projects.${mode}View`)}
            </button>
          ))}
        </div>
        {admin && (
          <Button
            data-testid="new-project"
            onClick={() => {
              setName("");
              setProjectDialog("new");
            }}
          >
            {t("projects.newProject")}
          </Button>
        )}
        {admin && selected && (
          <Button
            onClick={() => {
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
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
          >
            <option value="all">{t("projects.allTasks")}</option>
            <option value="mine">{t("projects.mine")}</option>
            <option value="agents">{t("projects.agents")}</option>
          </select>
        </div>
        <div className="field">
          <Label htmlFor="project-sort">{t("projects.sort")}</Label>
          <select
            id="project-sort"
            data-testid="project-sort"
            value={sort}
            onChange={(event) => setSort(event.target.value)}
          >
            {["created", "due", "priority", "title"].map((key) => (
              <option key={key} value={key}>
                {t(`projects.sort${key[0].toUpperCase()}${key.slice(1)}`)}
              </option>
            ))}
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
      <p className="section-hint">{t("projects.dragHint")}</p>
      <p className="sr-only" role="status">
        {announcement}
      </p>
      {tasks.isError || projects.isError || edit.isError ? (
        <p className="alert" role="alert">
          {t(errorKey(tasks.error ?? projects.error ?? edit.error))}
        </p>
      ) : null}
      {tasks.isPending ? (
        <p className="loading">{t("loading")}</p>
      ) : (
        <div
          ref={columns}
          className={`${view === "board" ? "planning-board" : "planning-list"}${drag ? " is-board-dragging" : ""}`}
        >
          {STATUSES.map((status) => {
            const items = visible.filter((task) => task.status === status);
            return (
              <section
                key={status}
                data-board-status={status}
                data-testid={`board-column-${status}`}
                className={`${view === "board" ? "column" : "board-list-group"} ${drag?.target === status ? "is-drop-target" : ""}`}
              >
                <h2>
                  {t(`status.${status}`)}{" "}
                  <span className="count-badge">{items.length}</span>
                </h2>
                {!items.length ? (
                  <p className="section-hint">{t("projects.empty")}</p>
                ) : (
                  <ul className="task-list">
                    {items.map((task) => (
                      <BoardCard
                        key={task.id}
                        task={task}
                        busy={busy}
                        move={move}
                        dragStart={dragStart}
                        dragging={drag?.id === task.id}
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
            className="task-card drag-preview"
            style={{ left: drag.left, top: drag.top, width: drag.width }}
          >
            <span className="section-hint">{t("projects.drag")}</span>
            <h3>{visible.find((task) => task.id === drag.id)?.title}</h3>
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
    </>
  );
}
function BoardCard({
  task,
  busy,
  move,
  dragStart,
  style,
  dragging,
}: {
  task: Task;
  busy: boolean;
  move: (task: Task, status: Task["status"]) => void;
  dragStart: (
    event: React.PointerEvent<HTMLButtonElement>,
    task: Task,
    allowed: Task["status"][],
  ) => void;
  style?: React.CSSProperties;
  dragging: boolean;
}) {
  const { me } = useWorkspace();
  const { t, i18n } = useTranslation();
  const members = useMembers(task.workspaceId);
  const access = useTaskAccess(task.id);
  const tasks = useTasks(task.workspaceId);
  const children =
    tasks.data?.filter((item) => item.parentId === task.id) ?? [];
  return (
    <li
      className={`task-card board-card ${dragging ? "is-dragging" : ""}`}
      data-testid="board-task"
      data-task-id={task.id}
      style={style}
    >
      <div className="task-card-top">
        <span className={`status status-${task.status}`}>
          {t(`status.${task.status}`)}
        </span>
        <span className="task-due">
          {task.dueAt
            ? new Intl.DateTimeFormat(i18n.resolvedLanguage ?? me.user.locale, {
                timeZone: me.user.tz,
                month: "short",
                day: "numeric",
              }).format(new Date(task.dueAt))
            : t("taskDetail.unscheduled")}
        </span>
      </div>
      <h3>
        {task.id.startsWith("optimistic:") ? (
          <span className="task-title-link" aria-busy="true">
            {task.title}
          </span>
        ) : (
          <Link className="task-title-link" href={`/tasks/${task.id}`}>
            {task.title}
          </Link>
        )}
      </h3>
      {task.parentId && (
        <p className="section-hint">
          ↳{" "}
          {tasks.data?.find((item) => item.id === task.parentId)?.title ??
            t("planning.parent")}
        </p>
      )}
      {children.length > 0 && (
        <p className="section-hint">
          {t("planning.subtasks")}{" "}
          {children.filter((item) => item.status === "done").length}/
          {children.length}
        </p>
      )}
      <p className="task-owner">
        {members.data?.find((item) => item.id === task.ownerId)?.name ??
          t("unknownMember")}
        {task.workerId &&
          ` · ${members.data?.find((item) => item.id === task.workerId)?.name ?? t("unknownMember")}`}
      </p>
      {task.labels.length > 0 && (
        <p className="section-hint">{task.labels.join(" · ")}</p>
      )}
      <div className="board-card-bottom">
        <Button
          data-testid="drag-handle"
          className="button-quiet drag-handle"
          disabled={busy || !access.data?.allowedStatuses.length}
          aria-label={t("projects.drag")}
          tabIndex={-1}
          onPointerDown={(event) =>
            dragStart(event, task, access.data?.allowedStatuses ?? [])
          }
        >
          <GripVertical size={16} aria-hidden="true" />
        </Button>
        <select
          data-testid="board-status"
          aria-label={t("planning.status")}
          disabled={busy || !access.data?.allowedStatuses.length}
          value={task.status}
          onChange={(event) => move(task, event.target.value as Task["status"])}
        >
          {[
            ...new Set([task.status, ...(access.data?.allowedStatuses ?? [])]),
          ].map((status) => (
            <option key={status} value={status}>
              {t(`status.${status}`)}
            </option>
          ))}
        </select>
        <span className="section-hint">
          {t(
            `planning.${["urgent", "high", "medium", "low"][task.priority - 1]}`,
          )}
        </span>
      </div>
    </li>
  );
}
