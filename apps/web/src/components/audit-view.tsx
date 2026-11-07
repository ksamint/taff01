"use client";
import "../styles/access-matrix.css";
import "../styles/audit.css";
import {
  type IntegrationAuditEntry,
  integrationAuditQuerySchema,
  integrationAuditResultSchema,
} from "@taff/schemas";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { errorKey, request } from "../lib/api";
import { useMembers } from "../lib/queries";
import { useWorkspace } from "./app-shell";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

const KINDS = ["trace_id", "request_id", "approval_id", "receipt_id"] as const;
type Kind = (typeof KINDS)[number];
type Filter = { kind: Kind; value: string } | null;

/**
 * The workspace's audit rows (milestone 36): the newest 200 recorded changes,
 * or those of one integration operation. Workspace administrators only; the
 * API enforces it and this page only explains a refusal.
 */
export function AuditView() {
  const { workspace, me, confirmed } = useWorkspace();
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? "en";
  const admin = workspace.role === "admin";
  const [kind, setKind] = useState<Kind>("trace_id");
  const [value, setValue] = useState("");
  const [filter, setFilter] = useState<Filter>(null);
  const [invalid, setInvalid] = useState(false);
  const members = useMembers(workspace.id);
  const audit = useQuery({
    queryKey: ["audit", workspace.id, filter?.kind, filter?.value],
    enabled: confirmed && admin,
    retry: false,
    queryFn: async () => {
      const params = new URLSearchParams({ workspaceId: workspace.id });
      if (filter) params.set(filter.kind, filter.value);
      return integrationAuditResultSchema.parse(
        await request(`/api/admin/audit/search?${params}`),
      );
    },
  });
  const apply = (next: Filter) => {
    if (
      next &&
      !integrationAuditQuerySchema.safeParse({
        workspaceId: workspace.id,
        [next.kind]: next.value,
      }).success
    )
      return setInvalid(true);
    setInvalid(false);
    setFilter(next);
  };
  const names = new Map<string, string>();
  for (const member of members.data ?? []) {
    names.set(member.id, member.name);
    if (member.userId) names.set(member.userId, member.name);
  }
  const when = (iso: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "medium",
      timeZone: me.user.tz,
    }).format(new Date(iso));
  const hasDetails = (entry: IntegrationAuditEntry) =>
    !!entry.details &&
    typeof entry.details === "object" &&
    Object.keys(entry.details).length > 0;

  return (
    <div className="access-page audit-page" data-testid="audit-view">
      <Link className="text-link" href="/orgs">
        {t("mcp.back")}
      </Link>
      <section className="page-heading">
        <p className="eyebrow">{workspace.name}</p>
        <h1>{t("audit.title")}</h1>
      </section>
      <p className="audit-hint" data-testid="audit-hint">
        {t("audit.hint")}
      </p>
      {!admin ? (
        <p role="alert" data-testid="audit-forbidden">
          {t("errors.forbidden")}
        </p>
      ) : (
        <>
          <form
            className="audit-filter"
            data-testid="audit-filter"
            onSubmit={(event) => {
              event.preventDefault();
              const trimmed = value.trim();
              apply(trimmed ? { kind, value: trimmed } : null);
            }}
          >
            <div className="field">
              <Label htmlFor="audit-kind">{t("audit.filter")}</Label>
              <select
                id="audit-kind"
                data-testid="audit-kind"
                value={kind}
                onChange={(event) => setKind(event.target.value as Kind)}
              >
                {KINDS.map((item) => (
                  <option key={item} value={item}>
                    {t(`audit.kinds.${item}`)}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <Label htmlFor="audit-value">{t("audit.value")}</Label>
              <Input
                id="audit-value"
                data-testid="audit-value"
                autoComplete="off"
                spellCheck={false}
                aria-invalid={invalid || undefined}
                aria-describedby={invalid ? "audit-invalid" : undefined}
                value={value}
                onChange={(event) => setValue(event.target.value)}
              />
            </div>
            <div className="audit-filter-buttons">
              <Button
                type="submit"
                className="button-primary"
                data-testid="audit-apply"
              >
                {t("audit.apply")}
              </Button>
              {filter && (
                <Button
                  type="button"
                  data-testid="audit-clear"
                  onClick={() => {
                    setValue("");
                    apply(null);
                  }}
                >
                  {t("audit.clear")}
                </Button>
              )}
            </div>
          </form>
          {invalid && (
            <p role="alert" id="audit-invalid" data-testid="audit-invalid">
              {t("audit.invalid")}
            </p>
          )}
          {filter && (
            <p className="audit-hint" data-testid="audit-filtered">
              {t("audit.filtered", {
                kind: t(`audit.kinds.${filter.kind}`),
                value: filter.value,
              })}
            </p>
          )}
          {audit.isPending && <p role="status">{t("loading")}</p>}
          {audit.error && (
            <p role="alert" data-testid="audit-error">
              {t(errorKey(audit.error))}
            </p>
          )}
          {audit.data && audit.data.entries.length === 0 && (
            <p data-testid="audit-empty">{t("audit.none")}</p>
          )}
          {audit.data && audit.data.entries.length > 0 && (
            <div
              className="access-scroll"
              role="region"
              aria-label={t("audit.title")}
              tabIndex={0}
            >
              <table className="access-table audit-table">
                <thead>
                  <tr>
                    <th scope="col">{t("audit.time")}</th>
                    <th scope="col">{t("audit.actor")}</th>
                    <th scope="col">{t("audit.action")}</th>
                    <th scope="col">{t("audit.resource")}</th>
                    <th scope="col">{t("audit.trace")}</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.data.entries.map((entry) => (
                    <tr
                      key={entry.id}
                      data-testid="audit-row"
                      data-action={entry.action}
                      data-resource={entry.resourceId}
                    >
                      <th scope="row">
                        <time dateTime={entry.createdAt}>
                          {when(entry.createdAt)}
                        </time>
                      </th>
                      <td>{names.get(entry.actorId) ?? entry.actorId}</td>
                      <td>
                        <code>{entry.action}</code>
                        {hasDetails(entry) && (
                          <details>
                            <summary>{t("audit.details")}</summary>
                            <pre>{JSON.stringify(entry.details, null, 2)}</pre>
                          </details>
                        )}
                      </td>
                      <td>
                        <code title={entry.resourceId}>
                          {entry.resourceId.slice(0, 8)}
                        </code>
                      </td>
                      <td>
                        {entry.traceId ? (
                          <Button
                            type="button"
                            className="button-quiet audit-trace"
                            aria-label={t("audit.followTrace", {
                              trace: entry.traceId,
                            })}
                            onClick={() => {
                              setKind("trace_id");
                              setValue(entry.traceId ?? "");
                              apply({
                                kind: "trace_id",
                                value: entry.traceId ?? "",
                              });
                            }}
                          >
                            <code>{entry.traceId.slice(0, 8)}</code>
                          </Button>
                        ) : (
                          "—"
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {audit.data?.truncated && (
            <p className="audit-hint" data-testid="audit-truncated">
              {t("audit.truncated")}
            </p>
          )}
        </>
      )}
    </div>
  );
}
