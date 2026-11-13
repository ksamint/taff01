"use client";
import {
  type WorkspaceAdministration,
  workspaceAdministrationListSchema,
  workspaceLifecycleSchema,
} from "@taff/schemas";
import {
  useIsMutating,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import Link from "next/link";
import { notFound } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ApiError, errorKey, request } from "../lib/api";
import { useWorkspaceAccess } from "../lib/m5-queries";
import { invalidateWorkspaces } from "../lib/mutations/organizations";
import { m3MutationKey } from "../lib/optimistic-m3";
import {
  isCurrentSnapshot,
  restoreQueries,
  snapshotQueries,
} from "../lib/query-snapshot";
import { useWorkspace } from "./app-shell";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { SheetDialog } from "./ui/sheet-dialog";

const archivedKey = ["archived-workspaces"] as const;
const administrationKey = ["admin-workspaces"] as const;
type Target = Pick<WorkspaceAdministration, "id" | "name">;

/** Both screens use the same authority-checked lifecycle endpoints. */
function WorkspaceLifecycle({ system = false }: { system?: boolean }) {
  const { me, workspace, confirmed, setWorkspaceId } = useWorkspace();
  const { t } = useTranslation();
  const client = useQueryClient();
  const access = useWorkspaceAccess(workspace.id);
  const busy = useIsMutating({ mutationKey: m3MutationKey }) > 0;
  const [target, setTarget] = useState<Target | null>(null);
  const [name, setName] = useState("");
  const key = system ? administrationKey : archivedKey;
  const list = useQuery({
    queryKey: key,
    enabled: confirmed && (!system || me.user.systemAdmin === true),
    queryFn: async () =>
      workspaceAdministrationListSchema.parse(
        await request(
          system ? "/api/admin/workspaces" : "/api/workspaces/archived",
        ),
      ),
    retry: false,
  });
  const change = useMutation({
    mutationKey: m3MutationKey,
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) =>
      request(`/api/workspaces/${id}${archived ? "" : "/restore"}`, {
        method: archived ? "DELETE" : "POST",
      }).then(workspaceLifecycleSchema.parse),
    onMutate: async ({ id, archived }) => {
      // Pin the visible fallback after an archive; restoring must not reselect it.
      if (!archived) setWorkspaceId(workspace.id);
      const snapshot = (
        await snapshotQueries(client, [archivedKey, administrationKey])
      ).start();
      client.setQueryData<WorkspaceAdministration[]>(
        administrationKey,
        (rows) =>
          rows?.map((row) =>
            row.id === id
              ? {
                  ...row,
                  archivedAt: archived ? new Date().toISOString() : null,
                }
              : row,
          ),
      );
      if (!archived)
        client.setQueryData<WorkspaceAdministration[]>(archivedKey, (rows) =>
          rows?.filter((row) => row.id !== id),
        );
      return snapshot.capture();
    },
    onError: (_, __, snapshot) => restoreQueries(client, snapshot),
    onSuccess: (_, __, snapshot) => {
      if (isCurrentSnapshot(client, snapshot)) setTarget(null);
    },
    onSettled: () =>
      Promise.all([
        invalidateWorkspaces(client),
        client.invalidateQueries({ queryKey: archivedKey }),
        client.invalidateQueries({ queryKey: administrationKey }),
      ]),
  });
  const canArchive =
    confirmed &&
    (system
      ? me.user.systemAdmin === true
      : !!access.data?.canArchiveWorkspace && target?.id === workspace.id);
  const forbidden = list.error instanceof ApiError && list.error.status === 403;
  const error = change.error ?? (!forbidden ? list.error : null);
  const openArchive = (row: Target) => {
    setTarget(row);
    setName("");
    change.reset();
  };
  return (
    <section className="me-section" data-testid="workspace-lifecycle">
      {!system && confirmed && access.data?.canArchiveWorkspace && (
        <Button
          className="button-quiet"
          data-testid="archive-organization"
          disabled={busy}
          onClick={() => openArchive(workspace)}
        >
          {t("organization.archive")}
        </Button>
      )}
      {system && <h1>{t("organization.administration")}</h1>}
      {error && (
        <p className="alert" role="alert">
          {t(errorKey(error))}
        </p>
      )}
      {confirmed && !forbidden && list.data && (
        <section data-testid="archived-organizations">
          {!system && <h2>{t("organization.archived")}</h2>}
          {!list.data.length && <p>{t("organization.noArchived")}</p>}
          <ul className="history-list">
            {list.data.map((row) => (
              <li key={row.id} data-testid={`lifecycle-${row.id}`}>
                <strong>{row.name}</strong>{" "}
                <span>
                  {t(
                    row.archivedAt
                      ? "organization.archivedState"
                      : "organization.activeState",
                  )}
                </span>{" "}
                {!row.personalOwnerId &&
                  (row.archivedAt ? (
                    <Button
                      data-testid={`restore-${row.id}`}
                      disabled={busy}
                      onClick={() =>
                        change.mutate({ id: row.id, archived: false })
                      }
                    >
                      {t("organization.restore")}
                    </Button>
                  ) : (
                    system && (
                      <Button
                        data-testid={`archive-${row.id}`}
                        disabled={busy}
                        onClick={() => openArchive(row)}
                      >
                        {t("organization.archive")}
                      </Button>
                    )
                  ))}
              </li>
            ))}
          </ul>
        </section>
      )}
      {target && canArchive && (
        <SheetDialog
          title={t("organization.archive")}
          onClose={() => setTarget(null)}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!busy && canArchive && name === target.name)
                change.mutate({ id: target.id, archived: true });
            }}
          >
            <p>
              {t("organization.archiveConsequences", { name: target.name })}
            </p>
            <div className="field">
              <Label htmlFor="archive-organization-name">
                {t("organization.archiveTypeName", { name: target.name })}
              </Label>
              <Input
                id="archive-organization-name"
                data-testid="archive-organization-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                required
                autoFocus
                disabled={busy}
              />
            </div>
            {change.error && (
              <p className="alert" role="alert">
                {t(errorKey(change.error))}
              </p>
            )}
            <Button
              data-testid="confirm-archive-organization"
              disabled={busy || name !== target.name}
            >
              {t(busy ? "working" : "organization.archive")}
            </Button>
          </form>
        </SheetDialog>
      )}
    </section>
  );
}

export function OrganizationLifecycle() {
  return <WorkspaceLifecycle />;
}

export function WorkspaceAdministration() {
  const { me } = useWorkspace();
  const { t } = useTranslation();
  if (!me.user.systemAdmin) notFound();
  return (
    <div className="organizations-view">
      <Link className="button button-quiet" href="/orgs">
        {t("organization.title")}
      </Link>
      <WorkspaceLifecycle system />
    </div>
  );
}
