"use client";
import "../styles/quick-add-parity.css";
import {
  type CreateTask,
  createTaskSchema,
  type Locale,
  quickAddInputSchema,
  quickAddResultSchema,
  type Task,
  taskSchema,
} from "@taff/schemas";
import {
  useIsMutating,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { ChevronDown, Sparkles } from "lucide-react";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { errorKey, request } from "../lib/api";
import { invalidateM3 } from "../lib/m3-queries";
import { useProjects, useWorkspaceAccess } from "../lib/m5-queries";
import { m3MutationKey, snapshotM3 } from "../lib/optimistic-m3";
import { tasksKey, useMembers } from "../lib/queries";
import { isCurrentSnapshot, restoreQueries } from "../lib/query-snapshot";
import { sessionVersion } from "../lib/session-cache";
import { deadlineIso } from "../lib/task-date";
import { useWorkspace } from "./app-shell";
import { MemberOptions } from "./member-options";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { SheetDialog } from "./ui/sheet-dialog";

export function QuickAddDialog({ onClose }: { onClose: () => void }) {
  const { workspace, me } = useWorkspace();
  const { t, i18n } = useTranslation();
  const locale = (i18n.resolvedLanguage ?? me.user.locale) as Locale;
  const client = useQueryClient();
  const members = useMembers(workspace.id);
  const projects = useProjects(workspace.id);
  const access = useWorkspaceAccess(workspace.id);
  const [text, setText] = useState("");
  const [form, setForm] = useState({
    title: "",
    ownerId: workspace.memberId,
    workerId: "",
    priority: "3",
    projectId: "",
    labels: "",
    date: "",
    time: "",
  });
  const [picker, setPicker] = useState<
    "owner" | "worker" | "due" | "project" | "priority" | "labels" | null
  >(null);
  const [invalid, setInvalid] = useState<string | null>(null);
  const busy = useIsMutating({ mutationKey: m3MutationKey }) > 0;
  const parse = useMutation({
    mutationFn: (text: string) =>
      request(`/api/quick-add/parse?workspaceId=${workspace.id}`, {
        method: "POST",
        body: JSON.stringify(quickAddInputSchema.parse({ text })),
      }).then(quickAddResultSchema.parse),
    onMutate: () => sessionVersion(client),
    onSuccess: (result, _, version) => {
      if (version !== sessionVersion(client)) return;
      setForm({
        title: result.title,
        ownerId: result.ownerId ?? workspace.memberId,
        workerId: result.workerId ?? "",
        priority: String(result.priority),
        projectId: result.projectId ?? "",
        labels: result.labels.join(", "),
        date: result.dueDate ?? "",
        time: result.dueTime ?? "",
      });
      setInvalid(null);
    },
  });
  const create = useMutation({
    mutationKey: m3MutationKey,
    mutationFn: (body: CreateTask) =>
      request("/api/tasks", {
        method: "POST",
        body: JSON.stringify(createTaskSchema.parse(body)),
      }).then(taskSchema.parse),
    onMutate: async (body) => {
      const snapshot = await snapshotM3(client);
      const id = `optimistic:${crypto.randomUUID()}`;
      const now = new Date().toISOString();
      client.setQueryData<Task[]>(tasksKey(workspace.id), (current = []) => [
        {
          ...body,
          id,
          number: 0,
          description: body.description ?? "",
          priority: body.priority ?? 3,
          projectId: body.projectId ?? null,
          parentId: body.parentId ?? null,
          labels: body.labels ?? [],
          dueAt: body.dueAt ?? null,
          status: "todo",
          version: 1,
          createdAt: now,
          updatedAt: now,
        },
        ...current,
      ]);
      return { snapshot, id };
    },
    onError: (_, __, context) => restoreQueries(client, context?.snapshot),
    onSuccess: (task, _, context) => {
      if (!isCurrentSnapshot(client, context.snapshot)) return;
      client.setQueryData<Task[]>(tasksKey(workspace.id), (current) =>
        current?.map((item) => (item.id === context.id ? task : item)),
      );
      onClose();
    },
    onSettled: () => invalidateM3(client),
  });
  const change = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  const presentName = (id: string, name: string) => name;
  const displayMembers = (members.data ?? []).map((member) => ({
    ...member,
    name: presentName(member.id, member.name),
  }));
  const owner = displayMembers.find((member) => member.id === form.ownerId);
  const worker = displayMembers.find((member) => member.id === form.workerId);
  const project = projects.data?.find((item) => item.id === form.projectId);
  const pickerLabels = {
    owner: "owner",
    worker: "worker",
    due: "planning.dueDate",
    project: "planning.project",
    priority: "planning.priority",
    labels: "planning.labels",
  };
  const dueLabel = (() => {
    if (!form.date) return t("taskDetail.unscheduled");
    try {
      const instant = deadlineIso(form.date, form.time, me.user.tz);
      return instant
        ? new Intl.DateTimeFormat(locale, {
            timeZone: me.user.tz,
            month: "short",
            day: "numeric",
            ...(form.time ? { hour: "2-digit", minute: "2-digit" } : {}),
          }).format(new Date(instant))
        : t("taskDetail.unscheduled");
    } catch {
      // Keep the editable draft visible; submit retains authoritative validation.
      return `${form.date} ${form.time}`.trim();
    }
  })();
  const chips = [
    { field: "owner" as const, label: owner?.name ?? t("unknownMember") },
    { field: "worker" as const, label: worker?.name ?? t("unassigned") },
    {
      field: "due" as const,
      label: dueLabel,
    },
    {
      field: "priority" as const,
      label: t(
        `planning.${["urgent", "high", "medium", "low"][Number(form.priority) - 1]}`,
      ),
    },
    {
      field: "project" as const,
      label: project
        ? presentName(project.id, project.name)
        : t("planning.noProject"),
    },
    { field: "labels" as const, label: form.labels || t("planning.labels") },
  ];
  return (
    <SheetDialog
      title={t("quickAdd.title")}
      onClose={onClose}
      className="quick-parity-dialog"
    >
      <form
        className="quick-parity-parse-form"
        onSubmit={(event) => {
          event.preventDefault();
          if (text.trim()) parse.mutate(text);
        }}
      >
        <textarea
          className="input"
          data-testid="quick-text"
          value={text}
          onChange={(event) => setText(event.target.value)}
          maxLength={1000}
          rows={3}
          autoFocus
          aria-label={t("quickAdd.placeholder")}
          placeholder={t("quickAdd.placeholder")}
        />
        <Button
          type="submit"
          data-testid="quick-parse"
          disabled={parse.isPending || busy || !text.trim()}
        >
          {t(parse.isPending ? "working" : "quickAdd.parse")}
        </Button>
      </form>
      <form
        className="quick-parity-create-form"
        onSubmit={(event) => {
          event.preventDefault();
          setInvalid(null);
          let dueAt: string | null;
          try {
            dueAt = deadlineIso(form.date, form.time, me.user.tz);
          } catch {
            setInvalid("planning.invalidDate");
            return;
          }
          const parsed = createTaskSchema.safeParse({
            workspaceId: workspace.id,
            title: form.title,
            ownerId: form.ownerId,
            workerId: form.workerId || null,
            dueAt,
            priority: Number(form.priority),
            projectId: form.projectId || null,
            labels: [
              ...new Set(
                form.labels
                  .split(/[,，]/)
                  .map((item) => item.trim())
                  .filter(Boolean),
              ),
            ],
          });
          if (parsed.success) create.mutate(parsed.data);
          else setInvalid("errors.invalid_input");
        }}
      >
        <fieldset
          disabled={busy || !access.data?.canCreateTasks}
          className="plain-fieldset"
        >
          <div className="quick-preview">
            <span className="quick-parity-title-label">
              <Label htmlFor="quick-title">{t("taskTitle")}</Label>
            </span>
            <Input
              id="quick-title"
              data-testid="quick-title"
              className="quick-parity-title"
              value={form.title}
              maxLength={200}
              placeholder={t("taskTitle")}
              onChange={(event) => change("title", event.target.value)}
            />
            <div className="quick-parity-chips">
              {chips.map((chip) => (
                <Button
                  type="button"
                  key={chip.field}
                  data-testid={`quick-field-${chip.field}`}
                  aria-label={`${t(pickerLabels[chip.field])}: ${chip.label}`}
                  aria-expanded={picker === chip.field}
                  onClick={() => setPicker(chip.field)}
                >
                  {chip.field === "worker" && worker?.kind === "agent" && (
                    <Sparkles size={12} strokeWidth={1.5} aria-hidden="true" />
                  )}
                  <span>{chip.label}</span>
                  <ChevronDown size={12} strokeWidth={1.5} aria-hidden="true" />
                </Button>
              ))}
            </div>
            {parse.data && (
              <div className="quick-parity-notes">
                <p>{t("quickAdd.preview")}</p>
                {parse.data.warnings.map((key) => (
                  <p key={key}>{t(`quickAdd.warning.${key}`)}</p>
                ))}
                {!!parse.data.unresolved.length && (
                  <p>
                    {t("quickAdd.unresolved", {
                      text: parse.data.unresolved.join(" · "),
                    })}
                  </p>
                )}
              </div>
            )}
          </div>
          <section className="quick-parity-examples">
            <span>{t("quickAdd.try")}</span>
            <Button
              type="button"
              onClick={() => setText(t("quickAdd.example"))}
            >
              {t("quickAdd.example")}
            </Button>
          </section>
          <Button
            data-testid="quick-create"
            type="submit"
            className="button-primary"
          >
            {t("addTask")}
          </Button>
        </fieldset>
        {(invalid || parse.isError || create.isError) && (
          <p className="alert" role="alert">
            {t(invalid ?? errorKey(parse.error ?? create.error))}
          </p>
        )}
      </form>
      {picker && (
        <SheetDialog
          title={t(pickerLabels[picker])}
          onClose={() => setPicker(null)}
          className="quick-parity-picker"
        >
          <div
            onKeyDown={(event) => {
              if (
                event.key === "Enter" &&
                event.target instanceof HTMLInputElement &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                setPicker(null);
              }
            }}
          >
            <fieldset
              disabled={busy || !access.data?.canCreateTasks}
              className="plain-fieldset"
            >
              {picker === "owner" && (
                <div className="field">
                  <Label htmlFor="quick-owner">{t("owner")}</Label>
                  <select
                    id="quick-owner"
                    data-testid="quick-owner"
                    value={form.ownerId}
                    onChange={(event) => change("ownerId", event.target.value)}
                  >
                    {displayMembers
                      .filter((member) => member.kind === "person")
                      .map((member) => (
                        <option key={member.id} value={member.id}>
                          {member.name}
                        </option>
                      ))}
                  </select>
                </div>
              )}
              {picker === "worker" && (
                <div className="field">
                  <Label htmlFor="quick-worker">{t("worker")}</Label>
                  <select
                    id="quick-worker"
                    data-testid="quick-worker"
                    value={form.workerId}
                    onChange={(event) => change("workerId", event.target.value)}
                  >
                    <MemberOptions members={displayMembers} />
                  </select>
                </div>
              )}
              {picker === "due" && (
                <>
                  <div className="field-grid">
                    <div className="field">
                      <Label htmlFor="quick-date">
                        {t("planning.dueDate")}
                      </Label>
                      <Input
                        id="quick-date"
                        data-testid="quick-date"
                        type="text"
                        inputMode="numeric"
                        placeholder="YYYY-MM-DD"
                        value={form.date}
                        onChange={(event) => change("date", event.target.value)}
                      />
                    </div>
                    <div className="field">
                      <Label htmlFor="quick-time">
                        {t("planning.dueTime")}
                      </Label>
                      <Input
                        id="quick-time"
                        data-testid="quick-time"
                        type="text"
                        inputMode="numeric"
                        placeholder="HH:mm"
                        value={form.time}
                        disabled={!form.date}
                        onChange={(event) => change("time", event.target.value)}
                      />
                    </div>
                  </div>
                  <p className="field-hint">
                    {t("planning.endOfDay", { zone: me.user.tz })}
                  </p>
                </>
              )}
              {picker === "project" && (
                <div className="field">
                  <Label htmlFor="quick-project">{t("planning.project")}</Label>
                  <select
                    id="quick-project"
                    data-testid="quick-project"
                    value={form.projectId}
                    onChange={(event) =>
                      change("projectId", event.target.value)
                    }
                  >
                    <option value="">{t("planning.noProject")}</option>
                    {projects.data
                      ?.filter((item) => !item.archived)
                      .map((item) => (
                        <option key={item.id} value={item.id}>
                          {presentName(item.id, item.name)}
                        </option>
                      ))}
                  </select>
                </div>
              )}
              {picker === "priority" && (
                <div className="field">
                  <Label htmlFor="quick-priority">
                    {t("planning.priority")}
                  </Label>
                  <select
                    id="quick-priority"
                    data-testid="quick-priority"
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
              )}
              {picker === "labels" && (
                <div className="field">
                  <Label htmlFor="quick-labels">{t("planning.labels")}</Label>
                  <Input
                    id="quick-labels"
                    data-testid="quick-labels"
                    value={form.labels}
                    onChange={(event) => change("labels", event.target.value)}
                  />
                </div>
              )}
              <Button
                type="button"
                className="button-primary"
                data-testid="quick-picker-close"
                onClick={() => setPicker(null)}
              >
                {t("planning.close")}
              </Button>
            </fieldset>
          </div>
        </SheetDialog>
      )}
    </SheetDialog>
  );
}
