"use client";
import {
  type CreateTask,
  createTaskSchema,
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
  const { t } = useTranslation();
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
  return (
    <SheetDialog title={t("quickAdd.title")} onClose={onClose}>
      <form
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
        <div className="action-row">
          <Button
            type="submit"
            data-testid="quick-parse"
            disabled={parse.isPending || busy || !text.trim()}
          >
            {t(parse.isPending ? "working" : "quickAdd.parse")}
          </Button>
          <Button
            type="button"
            className="button-quiet"
            onClick={() => setText(t("quickAdd.example"))}
          >
            {t("quickAdd.try")}
          </Button>
        </div>
      </form>
      {parse.data && (
        <div className="quick-preview">
          <p className="section-hint">{t("quickAdd.preview")}</p>
          {parse.data.warnings.map((key) => (
            <p className="section-hint" key={key}>
              {t(`quickAdd.warning.${key}`)}
            </p>
          ))}
          {parse.data.unresolved.length > 0 && (
            <p className="section-hint">
              {t("quickAdd.unresolved", {
                text: parse.data.unresolved.join(" · "),
              })}
            </p>
          )}
        </div>
      )}
      <form
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
          <div className="field">
            <Label htmlFor="quick-title">{t("taskTitle")}</Label>
            <Input
              id="quick-title"
              data-testid="quick-title"
              value={form.title}
              maxLength={200}
              onChange={(event) => change("title", event.target.value)}
            />
          </div>
          <div className="field-grid">
            <div className="field">
              <Label htmlFor="quick-owner">{t("owner")}</Label>
              <select
                id="quick-owner"
                data-testid="quick-owner"
                value={form.ownerId}
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
            <div className="field">
              <Label htmlFor="quick-worker">{t("worker")}</Label>
              <select
                id="quick-worker"
                data-testid="quick-worker"
                value={form.workerId}
                onChange={(event) => change("workerId", event.target.value)}
              >
                <MemberOptions members={members.data ?? []} />
              </select>
            </div>
          </div>
          <div className="field-grid">
            <div className="field">
              <Label htmlFor="quick-date">{t("planning.dueDate")}</Label>
              <Input
                id="quick-date"
                data-testid="quick-date"
                type="date"
                value={form.date}
                onChange={(event) => change("date", event.target.value)}
              />
            </div>
            <div className="field">
              <Label htmlFor="quick-time">{t("planning.dueTime")}</Label>
              <Input
                id="quick-time"
                data-testid="quick-time"
                type="time"
                value={form.time}
                disabled={!form.date}
                onChange={(event) => change("time", event.target.value)}
              />
            </div>
          </div>
          <p className="field-hint">
            {t("planning.endOfDay", { zone: me.user.tz })}
          </p>
          <div className="field-grid">
            <div className="field">
              <Label htmlFor="quick-project">{t("planning.project")}</Label>
              <select
                id="quick-project"
                data-testid="quick-project"
                value={form.projectId}
                onChange={(event) => change("projectId", event.target.value)}
              >
                <option value="">{t("planning.noProject")}</option>
                {projects.data
                  ?.filter((item) => !item.archived)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </div>
            <div className="field">
              <Label htmlFor="quick-priority">{t("planning.priority")}</Label>
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
          </div>
          <div className="field">
            <Label htmlFor="quick-labels">{t("planning.labels")}</Label>
            <Input
              id="quick-labels"
              data-testid="quick-labels"
              value={form.labels}
              onChange={(event) => change("labels", event.target.value)}
            />
          </div>
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
    </SheetDialog>
  );
}
