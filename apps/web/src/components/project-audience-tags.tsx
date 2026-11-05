"use client";
import "../styles/summaries.css";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { errorKey } from "../lib/api";
import {
  useAudienceTags,
  useProjectAudienceTags,
  useSetProjectAudienceTags,
} from "../lib/summary-queries";
import { showToast } from "../lib/toast";

/** Shareholder tags in the project header; guests never read audiences. */
export function ProjectAudienceChips({
  projectId,
  canRead,
}: {
  projectId: string;
  canRead: boolean;
}) {
  const { t } = useTranslation();
  const tags = useProjectAudienceTags(projectId, canRead);
  if (!tags.data?.tags.length) return null;
  return (
    <ul className="audience-chips" data-testid="project-audience-tags">
      {tags.data.tags.map((tag) => (
        <li
          key={tag.id}
          className="audience-chip"
          data-testid="project-audience-tag"
          data-tag={tag.id}
        >
          {t("audience.chip", {
            kind: t(`audience.kind.${tag.kind}`),
            org: tag.org,
          })}
        </li>
      ))}
    </ul>
  );
}

/**
 * Admin picker inside the project dialog. Each change saves at once and
 * offers Undo, which sends the previous tag set (no snapshot restore).
 */
export function ProjectAudiencePicker({
  workspaceId,
  projectId,
}: {
  workspaceId: string;
  projectId: string;
}) {
  const { t } = useTranslation();
  const all = useAudienceTags(workspaceId);
  const current = useProjectAudienceTags(projectId);
  const save = useSetProjectAudienceTags(projectId, all.data ?? []);
  // The box follows the click at once; the cache catches up on settle.
  const [pending, setPending] = useState<string[] | null>(null);
  const selected = pending ?? current.data?.tags.map((tag) => tag.id) ?? [];
  const choices = (all.data ?? []).filter(
    (tag) => !tag.archived || selected.includes(tag.id),
  );
  if (!choices.length) return null;
  const apply = (next: string[], previous: string[]) => {
    setPending(next);
    save.mutate(next, {
      onSuccess: () =>
        showToast(t("audience.tagsSaved"), {
          label: t("actions.undo"),
          run: () => save.mutate(previous),
        }),
      onSettled: () => setPending(null),
    });
  };
  return (
    <fieldset className="field" data-testid="project-audience-picker">
      <legend className="label">{t("audience.projectTags")}</legend>
      <p className="section-hint">{t("audience.projectTagsHint")}</p>
      {choices.map((tag) => (
        <label key={tag.id} className="summary-check">
          <input
            type="checkbox"
            data-testid="project-audience-option"
            data-tag={tag.id}
            checked={selected.includes(tag.id)}
            disabled={save.isPending || current.isPending}
            onChange={(event) =>
              apply(
                event.target.checked
                  ? [...selected, tag.id]
                  : selected.filter((id) => id !== tag.id),
                selected,
              )
            }
          />
          {t("audience.chip", {
            kind: t(`audience.kind.${tag.kind}`),
            org: tag.org,
          })}
        </label>
      ))}
      {save.error && (
        <p className="alert" role="alert">
          {t(errorKey(save.error))}
        </p>
      )}
    </fieldset>
  );
}
