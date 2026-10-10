"use client";

import type { Locale } from "@taff/schemas/base";
import { presentPrototypeField } from "@taff/schemas/prototype-data";
import { Check, Plus } from "lucide-react";
import Link from "next/link";
import type { MouseEvent } from "react";
import { useTranslation } from "react-i18next";
import { useWorkspace } from "./app-shell";
import { Button } from "./ui/button";
import "../styles/organization-chooser.css";

// Prototype organization sheet 880–894; rows expose only actual workspace data.
export function OrganizationChooser({
  heading = false,
  testIdPrefix,
  onSelect,
}: {
  heading?: boolean;
  testIdPrefix?: string;
  onSelect: (id: string, event: MouseEvent<HTMLButtonElement>) => void;
}) {
  const { me, workspace, signOutPending } = useWorkspace();
  const { t, i18n } = useTranslation();
  const locale = (i18n.resolvedLanguage ?? me.user.locale) as Locale;
  return (
    <div className="organization-chooser">
      {heading && <h2>{t("organization.switch")}</h2>}
      <p className="organization-chooser-hint">
        {t("organization.switchHint")}
      </p>
      <div className="organization-choices">
        {me.workspaces.map((item) => {
          const name = presentPrototypeField(
            item.id,
            "name",
            item.name,
            locale,
          );
          const selected = workspace.id === item.id;
          return (
            <Button
              key={item.id}
              type="button"
              className="organization-choice"
              data-testid={
                testIdPrefix ? `${testIdPrefix}${item.id}` : undefined
              }
              aria-pressed={selected}
              disabled={signOutPending}
              onClick={(event) => onSelect(item.id, event)}
            >
              <span className="organization-choice-tile" aria-hidden="true">
                {Array.from(name).slice(0, 1).join("")}
              </span>
              <span className="organization-choice-copy">
                <strong>{name}</strong>
                <span>{t(`organization.${item.role}`)}</span>
              </span>
              {selected && (
                <Check
                  className="organization-choice-check"
                  size={18}
                  aria-hidden="true"
                />
              )}
            </Button>
          );
        })}
      </div>
      <Link
        className="button organization-create-entry"
        href="/orgs#create"
        prefetch={false}
        data-testid="organization-create-entry"
      >
        <Plus size={16} aria-hidden="true" />
        {t("organization.create")}
      </Link>
    </div>
  );
}
