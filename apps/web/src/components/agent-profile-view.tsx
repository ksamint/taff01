"use client";

import {
  type AgentPermissionInput,
  type AgentProfile,
  type AgentProfileInput,
  agentPermissionInputSchema,
  agentProfileInputSchema,
  capabilitySchema,
  type RequestGrant,
  type ReviewPolicy,
  requestGrantSchema,
} from "@taff/schemas";
import {
  useIsMutating,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import { ArrowLeft, Sparkles } from "lucide-react";
import Link from "next/link";
import { type FormEvent, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { historyActor, historyMessage } from "../lib/agent-history";
import { errorKey, request } from "../lib/api";
import { agentKey, invalidateM3, useAgent } from "../lib/m3-queries";
import { m3MutationKey, snapshotM3 } from "../lib/optimistic-m3";
import { useMembers, useTasks } from "../lib/queries";
import { restoreQueries } from "../lib/query-snapshot";
import { useWorkspace } from "./app-shell";
import { GrantActions } from "./grant-actions";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

export function AgentProfileView({ agentId }: { agentId: string }) {
  const { t } = useTranslation();
  const profile = useAgent(agentId);
  if (profile.isPending) return <p className="loading">{t("loading")}</p>;
  if (profile.isError)
    return (
      <div>
        <p className="alert" role="alert">
          {t(errorKey(profile.error))}
        </p>
        <Button onClick={() => void profile.refetch()}>{t("retry")}</Button>
      </div>
    );
  return <AgentEditor key={agentId} data={profile.data} />;
}

function AgentEditor({ data }: { data: AgentProfile }) {
  const { t, i18n } = useTranslation();
  const { me, workspace } = useWorkspace();
  const client = useQueryClient();
  const members = useMembers(workspace.id);
  const tasks = useTasks(workspace.id);
  const [supervisorId, setSupervisorId] = useState(data.supervisorId ?? "");
  const [policy, setPolicy] = useState<ReviewPolicy>(data.reviewPolicy);
  const [duration, setDuration] = useState(
    data.maxDurationMs === null ? "" : String(data.maxDurationMs / 1000),
  );
  const [cost, setCost] = useState(
    data.maxCostMicros === null ? "" : String(data.maxCostMicros / 1_000_000),
  );
  const [validationError, setValidationError] = useState(false);
  const [capability, setCapability] =
    useState<(typeof capabilitySchema.options)[number]>("web.search");
  const [taskId, setTaskId] = useState("");
  const [reason, setReason] = useState("");
  const busy = useIsMutating({ mutationKey: m3MutationKey }) > 0;
  useEffect(() => {
    if (busy) return;
    setSupervisorId(data.supervisorId ?? "");
    setPolicy(data.reviewPolicy);
    setDuration(
      data.maxDurationMs === null ? "" : String(data.maxDurationMs / 1000),
    );
    setCost(
      data.maxCostMicros === null ? "" : String(data.maxCostMicros / 1_000_000),
    );
  }, [
    busy,
    data.supervisorId,
    data.reviewPolicy,
    data.maxDurationMs,
    data.maxCostMicros,
  ]);
  const save = useMutation({
    mutationKey: m3MutationKey,
    mutationFn: (body: AgentProfileInput) =>
      request(`/api/agents/${data.member.id}`, {
        method: "PATCH",
        body: JSON.stringify(agentProfileInputSchema.parse(body)),
      }),
    onMutate: async (body) => {
      const snapshot = await snapshotM3(client);
      client.setQueryData<AgentProfile>(agentKey(data.member.id), (current) =>
        current ? { ...current, ...body } : current,
      );
      return snapshot;
    },
    onError: (_, __, snapshot) => restoreQueries(client, snapshot),
    onSettled: () => invalidateM3(client),
  });
  const permission = useMutation({
    mutationKey: m3MutationKey,
    mutationFn: (body: AgentPermissionInput) =>
      request(`/api/agents/${data.member.id}/permissions`, {
        method: "PUT",
        body: JSON.stringify(agentPermissionInputSchema.parse(body)),
      }),
    onMutate: async (body) => {
      const snapshot = await snapshotM3(client);
      client.setQueryData<AgentProfile>(agentKey(data.member.id), (current) =>
        current
          ? {
              ...current,
              permissions: current.permissions.map((item) =>
                item.capability === body.capability ? body : item,
              ),
            }
          : current,
      );
      return snapshot;
    },
    onError: (_, __, snapshot) => restoreQueries(client, snapshot),
    onSettled: () => invalidateM3(client),
  });
  const grant = useMutation({
    mutationKey: m3MutationKey,
    mutationFn: (body: RequestGrant) =>
      request(`/api/agents/${data.member.id}/grants`, {
        method: "POST",
        body: JSON.stringify(requestGrantSchema.parse(body)),
      }),
    onMutate: async (body) => {
      const snapshot = await snapshotM3(client);
      const now = new Date().toISOString();
      client.setQueryData<AgentProfile>(agentKey(data.member.id), (current) =>
        current
          ? {
              ...current,
              grants: [
                {
                  id: `optimistic:${crypto.randomUUID()}`,
                  workspaceId: workspace.id,
                  agentId: data.member.id,
                  capability: body.capability,
                  taskId: body.taskId ?? null,
                  runId: body.runId ?? null,
                  reason: body.reason,
                  status: "pending",
                  expiresAt: null,
                  decidedBy: null,
                  createdAt: now,
                  updatedAt: now,
                },
                ...current.grants,
              ],
            }
          : current,
      );
      return snapshot;
    },
    onError: (_, __, snapshot) => restoreQueries(client, snapshot),
    onSuccess: () => setReason(""),
    onSettled: () => invalidateM3(client),
  });
  const locale = i18n.resolvedLanguage ?? me.user.locale;
  const when = (iso: string) =>
    new Intl.DateTimeFormat(locale, {
      timeZone: me.user.tz,
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }).format(new Date(iso));
  const name = (id: string | null) =>
    members.data?.find((member) => member.id === id || member.userId === id)
      ?.name ?? t(id ? "unknownMember" : "agentProfile.noSupervisor");
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = agentProfileInputSchema.safeParse({
      supervisorId: supervisorId || null,
      reviewPolicy: policy,
      maxDurationMs:
        duration === "" ? null : Math.round(Number(duration) * 1000),
      maxCostMicros: cost === "" ? null : Math.round(Number(cost) * 1_000_000),
    });
    setValidationError(!parsed.success);
    if (parsed.success) save.mutate(parsed.data);
  }
  function requestAccess(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const parsed = requestGrantSchema.safeParse({
      capability,
      reason,
      ...(taskId ? { taskId } : {}),
    });
    setValidationError(!parsed.success);
    if (parsed.success) grant.mutate(parsed.data);
  }
  return (
    <>
      <Link className="back-link" href="/me">
        <ArrowLeft size={16} aria-hidden="true" />
        {t("agentProfile.back")}
      </Link>
      <section className="page-heading">
        <span className="agent-avatar" aria-hidden="true">
          <Sparkles size={24} />
        </span>
        <h1 data-testid="agent-profile-heading">{data.member.name}</h1>
        <p className="task-count">
          {t("agentProfile.supervisedBy", { name: name(data.supervisorId) })}
        </p>
      </section>
      <div className="profile-layout">
        <div>
          <section className="profile-section">
            <h2>{t("agentProfile.permissions")}</h2>
            <p className="section-hint">{t("agentProfile.permissionsHint")}</p>
            <div className="permission-list">
              {data.permissions.map((item) => (
                <div className="permission-row" key={item.capability}>
                  <div>
                    <strong>
                      {t(`agentProfile.capability.${item.capability}`)}
                    </strong>
                    <code>{item.capability}</code>
                  </div>
                  <div
                    className="segmented"
                    role="group"
                    aria-label={t(`agentProfile.capability.${item.capability}`)}
                  >
                    {(["allow", "ask", "deny"] as const).map((decision) => (
                      <button
                        type="button"
                        key={decision}
                        data-testid={`permission-${item.capability}-${decision}`}
                        disabled={!data.canManage || busy}
                        aria-pressed={item.decision === decision}
                        onClick={() =>
                          permission.mutate({
                            capability: item.capability,
                            decision,
                          })
                        }
                      >
                        {t(`agentProfile.decision.${decision}`)}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {permission.isError && (
              <p className="alert" role="alert">
                {t(errorKey(permission.error))}
              </p>
            )}
          </section>
          <section className="profile-section">
            <h2>{t("agentProfile.settings")}</h2>
            <form onSubmit={submit} noValidate>
              <fieldset
                disabled={!data.canManage || busy}
                className="plain-fieldset"
              >
                <div className="field">
                  <Label htmlFor="agent-supervisor">
                    {t("agentProfile.supervisor")}
                  </Label>
                  <select
                    id="agent-supervisor"
                    data-testid="agent-supervisor"
                    value={supervisorId}
                    onChange={(event) => setSupervisorId(event.target.value)}
                  >
                    <option value="">{t("agentProfile.noSupervisor")}</option>
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
                  <Label htmlFor="agent-policy">
                    {t("agentProfile.policy")}
                  </Label>
                  <select
                    id="agent-policy"
                    data-testid="agent-policy"
                    value={policy}
                    onChange={(event) =>
                      setPolicy(event.target.value as ReviewPolicy)
                    }
                  >
                    <option value="always_review">
                      {t("agentProfile.alwaysReview")}
                    </option>
                    <option value="ask_only">
                      {t("agentProfile.askOnly")}
                    </option>
                  </select>
                  <p className="field-hint">{t("agentProfile.policyHint")}</p>
                </div>
                <div className="assignment-fields">
                  <div className="field">
                    <Label htmlFor="agent-duration">
                      {t("agentProfile.maxDuration")}
                    </Label>
                    <Input
                      id="agent-duration"
                      type="number"
                      min="0.001"
                      step="0.001"
                      value={duration}
                      onChange={(event) => setDuration(event.target.value)}
                      placeholder={t("agentProfile.unlimited")}
                    />
                  </div>
                  <div className="field">
                    <Label htmlFor="agent-cost">
                      {t("agentProfile.maxCost")}
                    </Label>
                    <Input
                      id="agent-cost"
                      type="number"
                      min="0.000001"
                      step="0.000001"
                      value={cost}
                      onChange={(event) => setCost(event.target.value)}
                      placeholder={t("agentProfile.unlimited")}
                    />
                  </div>
                </div>
                <div className="action-row">
                  <Button
                    data-testid="agent-save"
                    type="submit"
                    className="button-primary"
                  >
                    {t(save.isPending ? "working" : "agentProfile.save")}
                  </Button>
                </div>
              </fieldset>
            </form>
            {save.isSuccess && (
              <p role="status" className="section-hint">
                {t("agentProfile.saved")}
              </p>
            )}
          </section>
          <section className="profile-section">
            <h2>{t("agentProfile.runHistory")}</h2>
            {data.runs.length === 0 ? (
              <p className="section-hint">{t("agentProfile.noRuns")}</p>
            ) : (
              <ul className="history-list">
                {data.runs.map((run) => (
                  <li key={run.id}>
                    <Link className="text-link" href={`/tasks/${run.taskId}`}>
                      {tasks.data?.find((task) => task.id === run.taskId)
                        ?.title ?? t("agentProfile.task")}
                    </Link>
                    <span>{t(`run.status.${run.status}`)}</span>
                    <time dateTime={run.startedAt}>{when(run.startedAt)}</time>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
        <aside>
          <section className="profile-section">
            <h2>{t("grants.history")}</h2>
            {data.grants.length === 0 ? (
              <p className="section-hint">{t("grants.none")}</p>
            ) : (
              <ul className="grant-list">
                {data.grants.map((item) => (
                  <li key={item.id} data-testid="grant-card">
                    <div className="section-heading">
                      <strong>
                        {t(`agentProfile.capability.${item.capability}`)}
                      </strong>
                      <span className="status">
                        {t(`grants.status.${item.status}`)}
                      </span>
                    </div>
                    <p className="preserve-text">{item.reason}</p>
                    <p className="section-hint">
                      {item.taskId
                        ? t("grants.taskScope", {
                            task:
                              tasks.data?.find(
                                (task) => task.id === item.taskId,
                              )?.title ?? item.taskId,
                          })
                        : t("grants.workspaceScope")}
                    </p>
                    <p className="section-hint">
                      {item.expiresAt
                        ? t("grants.expires", { date: when(item.expiresAt) })
                        : t("grants.notGranted")}
                    </p>
                    <p className="section-hint">
                      {t("grants.recorded", {
                        date: when(item.updatedAt),
                        name: item.decidedBy
                          ? name(item.decidedBy)
                          : t("grants.pending"),
                      })}
                    </p>
                    <GrantActions
                      grant={item}
                      canDecide={data.canDecideGrants}
                    />
                  </li>
                ))}
              </ul>
            )}
          </section>
          {data.canManage && (
            <section className="profile-section">
              <h2>{t("grants.request")}</h2>
              <form onSubmit={requestAccess} noValidate>
                <div className="field">
                  <Label htmlFor="grant-capability">
                    {t("grants.capability")}
                  </Label>
                  <select
                    id="grant-capability"
                    value={capability}
                    onChange={(event) =>
                      setCapability(event.target.value as typeof capability)
                    }
                  >
                    {capabilitySchema.options.map((item) => (
                      <option key={item} value={item}>
                        {t(`agentProfile.capability.${item}`)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field">
                  <Label htmlFor="grant-task">{t("grants.scope")}</Label>
                  <select
                    id="grant-task"
                    value={taskId}
                    onChange={(event) => setTaskId(event.target.value)}
                  >
                    <option value="">{t("grants.workspaceScope")}</option>
                    {tasks.data
                      ?.filter((task) => task.workerId === data.member.id)
                      .map((task) => (
                        <option key={task.id} value={task.id}>
                          {task.title}
                        </option>
                      ))}
                  </select>
                </div>
                <div className="field">
                  <Label htmlFor="grant-reason">{t("grants.reason")}</Label>
                  <textarea
                    id="grant-reason"
                    className="input"
                    rows={3}
                    maxLength={2000}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </div>
                <div className="action-row">
                  <Button type="submit" disabled={busy || !reason.trim()}>
                    {t("grants.request")}
                  </Button>
                </div>
              </form>
            </section>
          )}
          <section className="profile-section">
            <h2>{t("agentProfile.changeHistory")}</h2>
            {data.history.length === 0 ? (
              <p className="section-hint">{t("agentProfile.noChanges")}</p>
            ) : (
              <ul className="history-list">
                {data.history.map((entry) => (
                  <li key={entry.id}>
                    <span>{historyMessage(entry, t)}</span>
                    <span>
                      {historyActor(
                        entry,
                        members.data ?? [],
                        t("unknownMember"),
                      )}
                    </span>
                    <time dateTime={entry.createdAt}>
                      {when(entry.createdAt)}
                    </time>
                  </li>
                ))}
              </ul>
            )}
          </section>
          {(validationError || save.isError || grant.isError) && (
            <p className="alert" role="alert">
              {t(
                validationError
                  ? "errors.invalid_input"
                  : errorKey(save.error ?? grant.error),
              )}
            </p>
          )}
        </aside>
      </div>
    </>
  );
}
