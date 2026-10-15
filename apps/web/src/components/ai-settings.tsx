"use client";

import { type AiSettings, aiSettingsSchema } from "@taff/schemas/assistant";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { errorKey, request } from "../lib/api";
import { useWorkspaceAccess } from "../lib/queries";
import { restoreQueries, snapshotQueries } from "../lib/query-snapshot";
import { useWorkspace } from "./app-shell";
import { Switch } from "./ui/switch";

/** D6 remains undecided: show the admin switch, allow disabling, never opt in. */
export function AiSettingsSection() {
  const { workspace } = useWorkspace();
  const { t } = useTranslation();
  const id = useId();
  const client = useQueryClient();
  const access = useWorkspaceAccess(workspace.id);
  const admin = !!access.data?.canInvite;
  const key = ["workspace-ai", workspace.id] as const;
  const settings = useQuery({
    queryKey: key,
    enabled: admin,
    retry: false,
    queryFn: async () =>
      aiSettingsSchema.parse(
        await request(`/api/workspaces/${workspace.id}/ai`),
      ),
  });
  const disable = useMutation({
    mutationFn: async () =>
      aiSettingsSchema.parse(
        await request(`/api/workspaces/${workspace.id}/ai`, {
          method: "PATCH",
          body: JSON.stringify({ enabled: false }),
        }),
      ),
    onMutate: async () => {
      const snapshot = await snapshotQueries(client, [key]);
      client.setQueryData<AiSettings>(key, (current) =>
        current ? { ...current, enabled: false } : current,
      );
      return snapshot;
    },
    onError: (_, __, snapshot) => restoreQueries(client, snapshot),
    onSuccess: (saved) => client.setQueryData(key, saved),
    onSettled: () => client.invalidateQueries({ queryKey: key }),
  });
  if (!admin) return null;
  return (
    <section className="field" aria-labelledby={id} data-testid="ai-settings">
      <h2 id={id} className="me-section-label">
        {t("me.aiSettings")}
      </h2>
      <label className="me-ai-switch">
        <Switch
          data-testid="ai-enabled"
          checked={settings.data?.enabled ?? false}
          disabled={!settings.data?.enabled || disable.isPending}
          onChange={() => disable.mutate()}
          aria-describedby={`${id}-hint`}
        />
        <span>{t("me.aiEnabled")}</span>
      </label>
      <p className="field-hint" id={`${id}-hint`}>
        {t("me.aiDisabledHint")}
      </p>
      {(settings.error || disable.error) && (
        <p className="alert" role="alert">
          {t(errorKey(settings.error ?? disable.error))}
        </p>
      )}
    </section>
  );
}
