"use client";
import {
  createTaskSchema,
  type Task,
  type TaskComment,
  taskCommentInputSchema,
  taskCommentSchema,
  taskSchema,
  updateTaskSchema,
} from "@taff/schemas";
import {
  type PrototypeLocale,
  presentPrototypeField,
} from "@taff/schemas/prototype-data";
import {
  useIsMutating,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { ArrowLeft, ChevronDown } from "lucide-react";
import Link from "next/link";
import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { errorKey, request } from "../lib/api";
import { invalidateM3 } from "../lib/m3-queries";
import {
  commentsKey,
  useEditTask,
  useProjects,
  useTaskAccess,
  useTaskComments,
} from "../lib/m5-queries";
import { m3MutationKey, snapshotM3 } from "../lib/optimistic-m3";
import { tasksKey, useMembers, useTasks } from "../lib/queries";
import { isCurrentSnapshot, restoreQueries } from "../lib/query-snapshot";
import { deadlineFields, deadlineIso } from "../lib/task-date";
import { useWorkspace } from "./app-shell";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { SheetDialog } from "./ui/sheet-dialog";
import { StatusGlyph } from "./ui/status-glyph";

export function TaskEditor({
  task,
  workerControl,
  scheduleControl,
  runControl,
  afterDescription,
}: {
  task: Task;
  workerControl: ReactNode;
  scheduleControl: ReactNode;
  runControl: ReactNode;
  afterDescription?: ReactNode;
}) {
  const { me } = useWorkspace();
  const authorId = me.workspaces.find(
    ({ id }) => id === task.workspaceId,
  )?.memberId;
  const { t, i18n } = useTranslation();
  const client = useQueryClient();
  const members = useMembers(task.workspaceId);
  const projects = useProjects(task.workspaceId);
  const access = useTaskAccess(task.id);
  const tasks = useTasks(task.workspaceId);
  const comments = useTaskComments(task.id);
  const edit = useEditTask();
  const busy = useIsMutating({ mutationKey: m3MutationKey }) > 0;
  const fields = useCallback(
    (value: Task) => ({
      title: value.title,
      description: value.description,
      ownerId: value.ownerId,
      priority: String(value.priority),
      projectId: value.projectId ?? "",
      labels: value.labels.join(", "),
      ...deadlineFields(value.dueAt, me.user.tz),
    }),
    [me.user.tz],
  );
  const [form, setForm] = useState(() => fields(task));
  const [baseline, setBaseline] = useState(() => ({
    version: task.version,
    form: fields(task),
  }));
  const [editing, setEditing] = useState(false);
  const [picker, setPicker] = useState<
    | "text"
    | "owner"
    | "due"
    | "priority"
    | "project"
    | "labels"
    | "status"
    | null
  >(null);
  const locale = (i18n.resolvedLanguage ?? me.user.locale) as PrototypeLocale;
  const presentName = (id: string, value: string) =>
    presentPrototypeField(id, "name", value, locale);
  const [invalid, setInvalid] = useState<string | null>(null);
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [comment, setComment] = useState("");
  useEffect(() => {
    if (!editing && !busy) {
      const value = fields(task);
      setForm(value);
      setBaseline({ version: task.version, form: value });
    }
  }, [task, fields, editing, busy]);
  const change = (key: keyof typeof form, value: string) => {
    if (!editing) setBaseline({ version: task.version, form: fields(task) });
    setEditing(true);
    setForm((current) => ({ ...current, [key]: value }));
  };
  const addSubtask = useMutation({
    mutationKey: m3MutationKey,
    mutationFn: (title: string) =>
      request("/api/tasks", {
        method: "POST",
        body: JSON.stringify(
          createTaskSchema.parse({
            workspaceId: task.workspaceId,
            title,
            ownerId: task.ownerId,
            parentId: task.id,
          }),
        ),
      }).then(taskSchema.parse),
    onMutate: async (title) => {
      const snapshot = await snapshotM3(client);
      const id = `optimistic:${crypto.randomUUID()}`;
      const now = new Date().toISOString();
      client.setQueryData<Task[]>(
        tasksKey(task.workspaceId),
        (current = []) => [
          {
            ...task,
            id,
            title,
            parentId: task.id,
            workerId: null,
            status: "todo",
            description: "",
            labels: [],
            version: 1,
            createdAt: now,
            updatedAt: now,
          },
          ...current,
        ],
      );
      return { snapshot, id };
    },
    onError: (_, __, context) => restoreQueries(client, context?.snapshot),
    onSuccess: (created, _, context) => {
      if (!isCurrentSnapshot(client, context.snapshot)) return;
      client.setQueryData<Task[]>(tasksKey(task.workspaceId), (current) =>
        current?.map((item) => (item.id === context.id ? created : item)),
      );
      setSubtaskTitle("");
    },
    onSettled: () => invalidateM3(client),
  });
  const addComment = useMutation({
    mutationKey: m3MutationKey,
    mutationFn: (body: string) =>
      request(`/api/tasks/${task.id}/comments`, {
        method: "POST",
        body: JSON.stringify(taskCommentInputSchema.parse({ body })),
      }).then(taskCommentSchema.parse),
    onMutate: async (body) => {
      const snapshot = await snapshotM3(client);
      const id = `optimistic:${crypto.randomUUID()}`;
      if (authorId)
        client.setQueryData<TaskComment[]>(
          commentsKey(task.id),
          (current = []) => [
            ...current,
            {
              id,
              workspaceId: task.workspaceId,
              taskId: task.id,
              authorId,
              body,
              createdAt: new Date().toISOString(),
            },
          ],
        );
      return { snapshot, id };
    },
    onError: (_, __, context) => restoreQueries(client, context?.snapshot),
    onSuccess: (created, _, context) => {
      if (!isCurrentSnapshot(client, context.snapshot)) return;
      client.setQueryData<TaskComment[]>(commentsKey(task.id), (current) =>
        current?.map((item) => (item.id === context.id ? created : item)),
      );
      setComment("");
    },
    onSettled: () => invalidateM3(client),
  });
  function save(event: FormEvent) {
    event.preventDefault();
    setInvalid(null);
    const patch: Record<string, unknown> = { version: baseline.version };
    if (access.data?.canEdit)
      for (const key of ["title", "description", "ownerId"] as const) {
        if (form[key] !== baseline.form[key]) patch[key] = form[key];
      }
    if (form.date !== baseline.form.date || form.time !== baseline.form.time) {
      try {
        patch.dueAt = deadlineIso(form.date, form.time, me.user.tz);
      } catch {
        setInvalid("planning.invalidDate");
        return;
      }
    }
    if (form.priority !== baseline.form.priority)
      patch.priority = Number(form.priority);
    if (form.projectId !== baseline.form.projectId)
      patch.projectId = form.projectId || null;
    if (form.labels !== baseline.form.labels)
      patch.labels = [
        ...new Set(
          form.labels
            .split(/[,，]/)
            .map((label) => label.trim())
            .filter(Boolean),
        ),
      ];
    const parsed = updateTaskSchema.safeParse(patch);
    if (!parsed.success) {
      setInvalid("errors.invalid_input");
      return;
    }
    edit.mutate(
      { id: task.id, body: parsed.data },
      {
        onSuccess: () => {
          setEditing(false);
          setPicker(null);
        },
      },
    );
  }
  const children = (tasks.data ?? []).filter(
    (item) => item.parentId === task.id,
  );
  const parent = tasks.data?.find((item) => item.id === task.parentId);
  const owner = members.data?.find((item) => item.id === form.ownerId);
  const ownerName = owner
    ? presentName(owner.id, owner.name)
    : t("unknownMember");
  const writable = access.data?.canEditMetadata ?? access.data?.canEdit;
  return (
    <>
      {task.parentId && (
        <Link className="task-parent-link" href={`/tasks/${task.parentId}`}>
          <ArrowLeft size={12} aria-hidden="true" />
          {t("planning.parent")} ·{" "}
          {parent
            ? presentPrototypeField(parent.id, "title", parent.title, locale)
            : t("agentProfile.task")}
        </Link>
      )}
      <div className="task-source-heading">
        <span className="task-project-label">
          {projects.data?.find((item) => item.id === task.projectId)?.name
            ? presentName(
                task.projectId!,
                projects.data!.find((item) => item.id === task.projectId)!.name,
              )
            : t("planning.noProject")}
        </span>
        <h1 data-testid="task-detail-heading">
          <Button
            type="button"
            className="button-quiet task-edit-text"
            data-testid="task-field-text"
            disabled={!access.data?.canEdit || busy}
            onClick={() => setPicker("text")}
          >
            {presentPrototypeField(task.id, "title", task.title, locale)}
          </Button>
        </h1>
      </div>
      {runControl}
      <div className="task-field-rows">
        <Button
          type="button"
          className="task-field-row"
          data-testid="task-field-status"
          onClick={() => setPicker("status")}
          disabled={busy || !access.data?.allowedStatuses.length}
        >
          <span>{t("planning.status")}</span>
          <span>
            <StatusGlyph status={task.status} />
            {t(`status.${task.status}`)}
          </span>
          <ChevronDown size={14} aria-hidden="true" />
        </Button>
        <Button
          type="button"
          className="task-field-row"
          data-testid="task-field-owner"
          onClick={() => setPicker("owner")}
          disabled={!access.data?.canEdit || busy}
        >
          <span>{t("owner")}</span>
          <span>
            <span className="task-person-avatar" aria-hidden="true">
              {owner ? ownerName.slice(0, 1) : ""}
            </span>
            <span className="task-field-value">{ownerName}</span>
          </span>
          <ChevronDown size={14} aria-hidden="true" />
        </Button>
        {workerControl}
        <Button
          type="button"
          className="task-field-row"
          data-testid="task-field-due"
          onClick={() => setPicker("due")}
          disabled={!writable || busy}
        >
          <span>{t("planning.dueDate")}</span>
          <span>
            {form.date
              ? !editing && task.dueAt
                ? new Intl.DateTimeFormat(locale, {
                    timeZone: me.user.tz,
                    month: "short",
                    day: "numeric",
                    ...(form.time
                      ? { hour: "2-digit" as const, minute: "2-digit" as const }
                      : {}),
                  }).format(new Date(task.dueAt))
                : `${form.date} ${form.time}`.trim()
              : t("taskDetail.unscheduled")}
          </span>
          <ChevronDown size={14} aria-hidden="true" />
        </Button>
        {scheduleControl}
        <Button
          type="button"
          className="task-field-row"
          data-testid="task-field-priority"
          onClick={() => setPicker("priority")}
          disabled={!writable || busy}
        >
          <span>{t("planning.priority")}</span>
          <span>
            {t(
              `planning.${["urgent", "high", "medium", "low"][Number(form.priority) - 1]}`,
            )}
          </span>
          <ChevronDown size={14} aria-hidden="true" />
        </Button>
        <Button
          type="button"
          className="task-field-row"
          data-testid="task-field-project"
          onClick={() => setPicker("project")}
          disabled={!writable || busy}
        >
          <span>{t("planning.project")}</span>
          <span>
            {projects.data?.find((item) => item.id === form.projectId)
              ? presentName(
                  form.projectId,
                  projects.data.find((item) => item.id === form.projectId)!
                    .name,
                )
              : t("planning.noProject")}
          </span>
          <ChevronDown size={14} aria-hidden="true" />
        </Button>
        <Button
          type="button"
          className="task-field-row"
          data-testid="task-field-labels"
          onClick={() => setPicker("labels")}
          disabled={!writable || busy}
        >
          <span>{t("planning.labels")}</span>
          <span>{form.labels || "—"}</span>
          <ChevronDown size={14} aria-hidden="true" />
        </Button>
      </div>
      <form className="task-field-editor" onSubmit={save}>
        {editing && (
          <Button
            data-testid="edit-save"
            disabled={!writable || busy}
            type="submit"
            className="button-primary"
          >
            {t(edit.isPending ? "working" : "planning.save")}
          </Button>
        )}
        {picker && picker !== "status" && (
          <SheetDialog
            title={t(
              picker === "text"
                ? "taskTitle"
                : picker === "owner"
                  ? "owner"
                  : `planning.${{ due: "dueDate", priority: "priority", project: "project", labels: "labels" }[picker]}`,
            )}
            onClose={() => setPicker(null)}
          >
            <fieldset
              className={`task-picker task-picker-${picker}`}
              disabled={!writable || busy}
            >
              <div className="field">
                <Label htmlFor="edit-title">{t("taskTitle")}</Label>
                <Input
                  id="edit-title"
                  data-testid="edit-title"
                  value={form.title}
                  maxLength={200}
                  disabled={!access.data?.canEdit}
                  onChange={(event) => change("title", event.target.value)}
                />
              </div>
              <div className="field">
                <Label htmlFor="edit-description">
                  {t("planning.description")}
                </Label>
                <textarea
                  id="edit-description"
                  data-testid="edit-description"
                  className="input"
                  value={form.description}
                  maxLength={20000}
                  rows={4}
                  disabled={!access.data?.canEdit}
                  onChange={(event) =>
                    change("description", event.target.value)
                  }
                />
              </div>
              <div className="field">
                <Label htmlFor="edit-owner">{t("owner")}</Label>
                <select
                  id="edit-owner"
                  data-testid="edit-owner"
                  value={form.ownerId}
                  disabled={!access.data?.canEdit}
                  onChange={(event) => change("ownerId", event.target.value)}
                >
                  {members.data
                    ?.filter((member) => member.kind === "person")
                    .map((member) => (
                      <option key={member.id} value={member.id}>
                        {presentName(member.id, member.name)}
                      </option>
                    ))}
                </select>
              </div>
              <div className="field-grid">
                <div className="field">
                  <Label htmlFor="edit-date">{t("planning.dueDate")}</Label>
                  <Input
                    id="edit-date"
                    data-testid="edit-date"
                    type="text"
                    placeholder="YYYY-MM-DD"
                    value={form.date}
                    onChange={(event) => change("date", event.target.value)}
                  />
                </div>
                <div className="field">
                  <Label htmlFor="edit-time">{t("planning.dueTime")}</Label>
                  <Input
                    id="edit-time"
                    data-testid="edit-time"
                    type="text"
                    placeholder="HH:mm"
                    value={form.time}
                    disabled={!form.date}
                    onChange={(event) => change("time", event.target.value)}
                  />
                </div>
              </div>
              <div className="field-grid">
                <div className="field">
                  <Label htmlFor="edit-priority">
                    {t("planning.priority")}
                  </Label>
                  <select
                    id="edit-priority"
                    data-testid="edit-priority"
                    value={form.priority}
                    onChange={(event) => change("priority", event.target.value)}
                  >
                    {["urgent", "high", "medium", "low"].map((key, index) => (
                      <option key={key} value={index + 1}>
                        {t(`planning.${key}`)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <Label htmlFor="edit-project">{t("planning.project")}</Label>
                  <select
                    id="edit-project"
                    data-testid="edit-project"
                    value={form.projectId}
                    onChange={(event) =>
                      change("projectId", event.target.value)
                    }
                  >
                    <option value="">{t("planning.noProject")}</option>
                    {projects.data
                      ?.filter(
                        (item) => !item.archived || item.id === task.projectId,
                      )
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.name}
                        </option>
                      ))}
                  </select>
                </div>
              </div>
              <div className="field">
                <Label htmlFor="edit-labels">{t("planning.labels")}</Label>
                <Input
                  id="edit-labels"
                  data-testid="edit-labels"
                  value={form.labels}
                  onChange={(event) => change("labels", event.target.value)}
                  aria-describedby="labels-hint"
                />
                <p id="labels-hint" className="field-hint">
                  {t("planning.labelsHint")}
                </p>
              </div>
            </fieldset>
            {(invalid || edit.isError) && (
              <p className="alert" role="alert">
                {t(invalid ?? errorKey(edit.error))}
              </p>
            )}
            <Button
              className="button-primary"
              type="button"
              onClick={() => setPicker(null)}
            >
              {t("planning.close")}
            </Button>
          </SheetDialog>
        )}
      </form>
      {task.description && (
        <p className="task-description preserve-text">
          {presentPrototypeField(
            task.id,
            "description",
            task.description,
            locale,
          )}
        </p>
      )}
      {!access.data?.canEdit && (
        <p className="section-hint">{t("planning.readOnly")}</p>
      )}
      {(invalid || edit.isError || access.isError || projects.isError) && (
        <p className="alert" role="alert">
          {t(invalid ?? errorKey(edit.error ?? access.error ?? projects.error))}
        </p>
      )}
      {edit.isError && editing && (
        <Button
          type="button"
          data-testid="edit-reload"
          disabled={busy}
          onClick={() => {
            const latest = fields(task);
            setForm(latest);
            setBaseline({ version: task.version, form: latest });
            setEditing(false);
            setInvalid(null);
            edit.reset();
          }}
        >
          {t("planning.reloadValues")}
        </Button>
      )}
      {edit.isSuccess && (
        <p className="section-hint" role="status">
          {t("planning.saved")}
        </p>
      )}
      {afterDescription}
      {picker === "status" && (
        <SheetDialog
          title={t("planning.status")}
          onClose={() => setPicker(null)}
        >
          {" "}
          <div className="field">
            <Label htmlFor="edit-status">{t("planning.status")}</Label>
            <select
              id="edit-status"
              data-testid="edit-status"
              disabled={busy || !access.data?.allowedStatuses.length}
              value={task.status}
              onChange={(event) =>
                edit.mutate({
                  id: task.id,
                  body: {
                    version: task.version,
                    status: event.target.value as Task["status"],
                  },
                })
              }
            >
              {[
                ...new Set([
                  task.status,
                  ...(access.data?.allowedStatuses ?? []),
                ]),
              ].map((status) => (
                <option
                  key={status}
                  value={status}
                  disabled={
                    status !== task.status &&
                    !access.data?.allowedStatuses.includes(status)
                  }
                >
                  {t(`status.${status}`)}
                </option>
              ))}
            </select>
          </div>
        </SheetDialog>
      )}
      <section className="profile-section">
        <h2>
          {t("planning.subtasks")}{" "}
          <span className="count-badge">
            {children.filter((item) => item.status === "done").length}/
            {children.length}
          </span>
        </h2>
        <ul className="history-list">
          {children.map((child) => (
            <li key={child.id}>
              {child.id.startsWith("optimistic:") ? (
                <span className="text-link" aria-busy="true">
                  {child.title}
                </span>
              ) : (
                <Link href={`/tasks/${child.id}`} className="text-link">
                  {child.title}
                </Link>
              )}

              <span className={`status status-${child.status}`}>
                {t(`status.${child.status}`)}
              </span>
            </li>
          ))}
        </ul>
        <form
          className="action-row"
          onSubmit={(event) => {
            event.preventDefault();
            if (subtaskTitle.trim()) addSubtask.mutate(subtaskTitle);
          }}
        >
          <Input
            data-testid="subtask-title"
            value={subtaskTitle}
            onChange={(event) => setSubtaskTitle(event.target.value)}
            placeholder={t("planning.subtaskTitle")}
            aria-label={t("planning.subtaskTitle")}
            maxLength={200}
            disabled={!access.data?.canEdit || busy}
          />
          <Button
            data-testid="subtask-submit"
            type="submit"
            disabled={!access.data?.canEdit || busy || !subtaskTitle.trim()}
          >
            {t("addTask")}
          </Button>
        </form>
        {addSubtask.isError && (
          <p className="alert" role="alert">
            {t(errorKey(addSubtask.error))}
          </p>
        )}
      </section>
      <section className="profile-section">
        <h2>{t("planning.comments")}</h2>
        {comments.isError ? (
          <p className="alert" role="alert">
            {t(errorKey(comments.error))}
          </p>
        ) : !comments.data?.length ? (
          <p className="section-hint">{t("planning.noComments")}</p>
        ) : (
          <ul className="review-comments">
            {comments.data.map((entry) => (
              <li key={entry.id}>
                <strong>
                  {members.data?.find((member) => member.id === entry.authorId)
                    ?.name ?? t("unknownMember")}
                </strong>
                <time dateTime={entry.createdAt}>
                  {new Intl.DateTimeFormat(
                    i18n.resolvedLanguage ?? me.user.locale,
                    {
                      timeZone: me.user.tz,
                      dateStyle: "medium",
                      timeStyle: "short",
                    },
                  ).format(new Date(entry.createdAt))}
                </time>
                <p className="preserve-text">{entry.body}</p>
              </li>
            ))}
          </ul>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (comment.trim()) addComment.mutate(comment);
          }}
        >
          <textarea
            className="input"
            data-testid="task-comment"
            aria-label={t("planning.commentPlaceholder")}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            maxLength={5000}
            rows={3}
            disabled={!access.data?.canComment || busy}
          />
          <Button
            data-testid="task-comment-submit"
            type="submit"
            disabled={!access.data?.canComment || busy || !comment.trim()}
          >
            {t("planning.addComment")}
          </Button>
        </form>
        {addComment.isError && (
          <p className="alert" role="alert">
            {t(errorKey(addComment.error))}
          </p>
        )}
      </section>
    </>
  );
}
