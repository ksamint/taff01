"use client";
// Task fields, subtasks and activity (prototype v2 phone 533–691, desktop
// panel 1590–1707). Phone rows open pickers; the desktop panel edits inline
// and its status control shows a toast whose 撤銷 PATCHes the old value back.
import {
  type Locale,
  type Task,
  taskReference,
  updateTaskSchema,
} from "@taff/schemas";
import { useIsMutating } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, Send, Sparkles } from "lucide-react";
import Link from "next/link";
import {
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import { errorKey } from "../lib/api";
import { initials } from "../lib/initials";
import {
  useEditTask,
  useProjects,
  useTaskAccess,
  useTaskComments,
} from "../lib/m5-queries";
import {
  useAddSubtask,
  useAddTaskComment,
  useUndoableTaskEdit,
} from "../lib/mutations/tasks";
import { m3MutationKey } from "../lib/optimistic-m3";
import { useMembers, useTasks } from "../lib/queries";
import { deadlineFields, deadlineIso } from "../lib/task-date";
import { useWorkspace } from "./app-shell";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { SheetDialog } from "./ui/sheet-dialog";
import { StatusGlyph } from "./ui/status-glyph";

const PRIORITIES = ["urgent", "high", "medium", "low"] as const;

export function TaskEditor({
  task,
  desktop = false,
  workerControl,
  scheduleControl,
  runControl,
  contacts,
  afterDescription,
}: {
  task: Task;
  /** The desktop right panel: inline controls instead of picker rows. */
  desktop?: boolean;
  workerControl: ReactNode;
  scheduleControl: ReactNode;
  runControl: ReactNode;
  contacts?: ReactNode;
  afterDescription?: ReactNode;
}) {
  const { me } = useWorkspace();
  const taskWorkspace = me.workspaces.find(({ id }) => id === task.workspaceId);
  const authorId = taskWorkspace?.memberId;
  const { t, i18n } = useTranslation();
  const ids = useId();
  const members = useMembers(task.workspaceId);
  const projects = useProjects(task.workspaceId);
  const access = useTaskAccess(task.id);
  const tasks = useTasks(task.workspaceId);
  const comments = useTaskComments(task.id);
  const edit = useEditTask();
  const inline = useUndoableTaskEdit();
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
  const locale = (i18n.resolvedLanguage ?? me.user.locale) as Locale;
  const [invalid, setInvalid] = useState<string | null>(null);
  const [subtaskTitle, setSubtaskTitle] = useState("");
  const [comment, setComment] = useState("");
  const [description, setDescription] = useState<string | null>(null);
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
  const addSubtask = useAddSubtask(task, {
    onAdded: () => setSubtaskTitle(""),
  });
  const addComment = useAddTaskComment(task, authorId, {
    onAdded: () => setComment(""),
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
  const doneChildren = children.filter((item) => item.status === "done").length;
  const parent = tasks.data?.find((item) => item.id === task.parentId);
  const owner = members.data?.find((item) => item.id === form.ownerId);
  const ownerName = owner ? owner.name : t("unknownMember");
  const project = projects.data?.find((item) => item.id === task.projectId);
  const formProject = projects.data?.find((item) => item.id === form.projectId);
  const writable = access.data?.canEditMetadata ?? access.data?.canEdit;
  const inlineDisabled = busy || editing;
  const statuses = [
    ...new Set([task.status, ...(access.data?.allowedStatuses ?? [])]),
  ];
  const dueText = form.date
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
    : t("taskDetail.unscheduled");
  const fieldLabel = (key: string) =>
    key === "owner" ? t("owner") : t(`planning.${key}`);
  const statusRow = desktop ? (
    <div className="task-field-row">
      <label htmlFor={`${ids}-status`}>{t("planning.status")}</label>
      <span className="task-field-control">
        <StatusGlyph status={task.status} />
        <select
          id={`${ids}-status`}
          data-testid="detail-status"
          value={task.status}
          disabled={inlineDisabled || !access.data?.allowedStatuses.length}
          onChange={(event) => {
            const status = event.target.value as Task["status"];
            inline.change(task, { status }, () =>
              t("taskDetail.statusChanged", { status: t(`status.${status}`) }),
            );
          }}
        >
          {statuses.map((status) => (
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
      </span>
    </div>
  ) : (
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
  );
  const pickerRow = (
    key: "owner" | "due" | "priority" | "project" | "labels",
    value: ReactNode,
    enabled: boolean,
  ) => (
    <Button
      type="button"
      className="task-field-row"
      data-testid={`task-field-${key}`}
      onClick={() => setPicker(key)}
      disabled={!enabled || busy}
    >
      <span>{key === "due" ? t("planning.dueDate") : fieldLabel(key)}</span>
      <span>{value}</span>
      <ChevronDown size={14} aria-hidden="true" />
    </Button>
  );
  const ownerValue = (
    <>
      <span className="task-person-avatar" aria-hidden="true">
        {owner ? initials(ownerName) : ""}
      </span>
      <span className="task-field-value">{ownerName}</span>
    </>
  );
  const selectRow = (
    key: "owner" | "priority" | "project",
    value: string,
    options: ReactNode,
    enabled: boolean,
    onChange: (value: string) => void,
  ) => (
    <div className="task-field-row">
      <label htmlFor={`${ids}-${key}`}>{fieldLabel(key)}</label>
      <span className="task-field-control">
        <select
          id={`${ids}-${key}`}
          data-testid={`detail-${key}`}
          value={value}
          disabled={!enabled || inlineDisabled}
          onChange={(event) => onChange(event.target.value)}
        >
          {options}
        </select>
      </span>
    </div>
  );
  const saved = (key: string) => () =>
    t("taskDetail.fieldSaved", { field: fieldLabel(key) });
  return (
    <>
      {task.parentId && (
        <Link className="task-parent-link" href={`/tasks/${task.parentId}`}>
          <ArrowLeft size={12} aria-hidden="true" />
          <span>
            {t("planning.parent")} ·{" "}
            {parent
              ? `${taskWorkspace ? `${taskReference(taskWorkspace.key, parent.number)} ` : ""}${parent.title}`
              : t("agentProfile.task")}
          </span>
        </Link>
      )}
      <div className="task-source-heading">
        {!desktop && (
          <span className="task-project-label">
            {project?.name ?? t("planning.noProject")}
          </span>
        )}
        <h1 data-testid="task-detail-heading">
          <Button
            type="button"
            className="button-quiet task-edit-text"
            data-testid="task-field-text"
            disabled={!access.data?.canEdit || busy}
            onClick={() => setPicker("text")}
          >
            {task.title}
          </Button>
        </h1>
      </div>
      {runControl}
      <div className="task-field-rows">
        {statusRow}
        {desktop
          ? selectRow(
              "owner",
              task.ownerId,
              members.data
                ?.filter((member) => member.kind === "person")
                .map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}
                  </option>
                )),
              !!access.data?.canEdit && !!members.data,
              (ownerId) => inline.change(task, { ownerId }, saved("owner")),
            )
          : pickerRow("owner", ownerValue, !!access.data?.canEdit)}
        {workerControl}
        {pickerRow("due", dueText, !!writable)}
        {scheduleControl}
        {desktop
          ? selectRow(
              "priority",
              String(task.priority),
              PRIORITIES.map((key, index) => (
                <option key={key} value={index + 1}>
                  {t(`planning.${key}`)}
                </option>
              )),
              !!writable,
              (priority) =>
                inline.change(
                  task,
                  { priority: Number(priority) },
                  saved("priority"),
                ),
            )
          : pickerRow(
              "priority",
              t(`planning.${PRIORITIES[Number(form.priority) - 1]}`),
              !!writable,
            )}
        {desktop
          ? selectRow(
              "project",
              task.projectId ?? "",
              <>
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
              </>,
              !!writable && !!projects.data,
              (projectId) =>
                inline.change(
                  task,
                  { projectId: projectId || null },
                  saved("project"),
                ),
            )
          : pickerRow(
              "project",
              formProject?.name ?? t("planning.noProject"),
              !!writable,
            )}
        {pickerRow("labels", form.labels || "—", !!writable)}
      </div>
      {contacts}
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
                        {member.name}
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
                    placeholder={t("inputFormat.date")}
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
                    placeholder={t("inputFormat.time")}
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
                    {PRIORITIES.map((key, index) => (
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
      {desktop ? (
        <form
          className="task-description-form"
          onSubmit={(event) => {
            event.preventDefault();
            if (description !== null && description !== task.description)
              inline.change(
                task,
                { description },
                () =>
                  t("taskDetail.fieldSaved", {
                    field: t("planning.description"),
                  }),
                () => setDescription(null),
              );
          }}
        >
          <Label htmlFor={`${ids}-description`}>
            {t("planning.description")}
          </Label>
          <textarea
            id={`${ids}-description`}
            data-testid="detail-description"
            className="input"
            value={description ?? task.description}
            placeholder={t("taskDetail.descriptionPlaceholder")}
            maxLength={20000}
            rows={3}
            disabled={!access.data?.canEdit || inlineDisabled}
            onChange={(event) => setDescription(event.target.value)}
          />
          {description !== null && description !== task.description && (
            <div className="action-row">
              <Button
                type="submit"
                className="button-primary"
                data-testid="detail-description-save"
                disabled={inlineDisabled}
              >
                {t("planning.save")}
              </Button>
              <Button type="button" onClick={() => setDescription(null)}>
                {t("search.cancel")}
              </Button>
            </div>
          )}
        </form>
      ) : (
        task.description && (
          <p className="task-description preserve-text">{task.description}</p>
        )
      )}
      {!access.data?.canEdit && (
        <p className="section-hint">{t("planning.readOnly")}</p>
      )}
      {(invalid ||
        edit.isError ||
        inline.isError ||
        access.isError ||
        projects.isError) && (
        <p className="alert" role="alert">
          {t(
            invalid ??
              errorKey(
                edit.error ?? inline.error ?? access.error ?? projects.error,
              ),
          )}
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
              {statuses.map((status) => (
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
      <section className="task-section" aria-labelledby={`${ids}-subtasks`}>
        <div className="task-section-heading">
          <h2 id={`${ids}-subtasks`}>{t("planning.subtasks")}</h2>
          <span className="task-section-count count-badge">
            {doneChildren}/{children.length}
          </span>
        </div>
        {!!children.length && (
          <div className="task-subtask-progress" aria-hidden="true">
            <span
              style={{ width: `${(doneChildren / children.length) * 100}%` }}
            />
          </div>
        )}
        <ul className="history-list task-subtasks">
          {children.map((child) => {
            const worker = members.data?.find(
              (member) => member.id === child.workerId,
            );
            return (
              <li key={child.id}>
                <StatusGlyph status={child.status} />
                {taskWorkspace && child.number > 0 && (
                  <span className="task-subtask-ref">
                    {taskReference(taskWorkspace.key, child.number)}
                  </span>
                )}
                {child.id.startsWith("optimistic:") ? (
                  <span className="text-link" aria-busy="true">
                    {child.title}
                  </span>
                ) : (
                  <Link
                    href={`/tasks/${child.id}`}
                    className={`text-link${child.status === "done" ? " is-done" : ""}`}
                  >
                    {child.title}
                  </Link>
                )}
                <span className="sr-only">{t(`status.${child.status}`)}</span>
                {worker && (
                  <span
                    className={`task-subtask-worker${worker.kind === "agent" ? " is-agent" : ""}`}
                    title={worker.name}
                    aria-hidden="true"
                  >
                    {worker.kind === "agent" ? (
                      <Sparkles size={12} />
                    ) : (
                      initials(worker.name)
                    )}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
        <form
          className="task-inline-form"
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
      <section className="task-section" aria-labelledby={`${ids}-activity`}>
        <div className="task-section-heading">
          <h2 id={`${ids}-activity`}>{t("taskDetail.activity")}</h2>
        </div>
        {comments.isError ? (
          <p className="alert" role="alert">
            {t(errorKey(comments.error))}
          </p>
        ) : !comments.data?.length ? (
          <p className="section-hint">{t("planning.noComments")}</p>
        ) : (
          <ul className="review-comments task-activity">
            {comments.data.map((entry) => {
              const author = members.data?.find(
                (member) => member.id === entry.authorId,
              );
              const name = author?.name ?? t("unknownMember");
              return (
                <li key={entry.id}>
                  <span
                    className={`task-activity-avatar${author?.kind === "agent" ? " is-agent" : ""}`}
                    aria-hidden="true"
                  >
                    {author?.kind === "agent" ? (
                      <Sparkles size={12} />
                    ) : (
                      initials(name)
                    )}
                  </span>
                  <div className="task-activity-copy">
                    <div className="task-activity-meta">
                      <strong>{name}</strong>
                      <time dateTime={entry.createdAt}>
                        {new Intl.DateTimeFormat(locale, {
                          timeZone: me.user.tz,
                          dateStyle: "medium",
                          timeStyle: "short",
                        }).format(new Date(entry.createdAt))}
                      </time>
                    </div>
                    <p className="preserve-text">{entry.body}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
      <form
        className="task-comment-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (comment.trim()) addComment.mutate(comment);
        }}
      >
        <textarea
          className="input"
          data-testid="task-comment"
          aria-label={t("planning.commentPlaceholder")}
          placeholder={t("planning.commentPlaceholder")}
          value={comment}
          onChange={(event) => setComment(event.target.value)}
          maxLength={5000}
          rows={1}
          disabled={!access.data?.canComment || busy}
        />
        <Button
          data-testid="task-comment-submit"
          type="submit"
          className="button-primary"
          aria-label={t("planning.addComment")}
          disabled={!access.data?.canComment || busy || !comment.trim()}
        >
          <Send size={16} aria-hidden="true" />
        </Button>
        {addComment.isError && (
          <p className="alert" role="alert">
            {t(errorKey(addComment.error))}
          </p>
        )}
      </form>
    </>
  );
}
