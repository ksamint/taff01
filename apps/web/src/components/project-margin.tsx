"use client";

import { projectMarginSchema } from "@taff/schemas";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { errorKey, request } from "../lib/api";
import { formatMoneyMicros } from "../lib/money-micros";
import { Button } from "./ui/button";

export const projectMarginKey = (projectId: string) =>
  ["project-margin", projectId] as const;

export function ProjectMargin({ projectId }: { projectId: string }) {
  const { t, i18n } = useTranslation();
  const locale = i18n.resolvedLanguage ?? "en";
  const margin = useQuery({
    queryKey: projectMarginKey(projectId),
    queryFn: async ({ signal }) =>
      projectMarginSchema.parse(
        await request(`/api/costs/projects/${projectId}/margin`, {
          cache: "no-store",
          signal,
        }),
      ),
    retry: false,
  });
  return (
    <div>
      <dt>{t("projectFinance.margin")}</dt>
      <dd data-testid="project-finance-margin">
        {margin.isPending && (
          <span className="project-finance-note" aria-live="polite">
            {t("loading")}
          </span>
        )}
        {margin.isSuccess &&
          (margin.data.currency
            ? formatMoneyMicros(
                margin.data.marginMicros,
                margin.data.currency,
                locale,
              )
            : new Intl.NumberFormat(locale).format(0))}
        {margin.error && (
          <div className="project-finance-actions">
            <span className="project-finance-note" role="alert">
              {t(errorKey(margin.error))}
            </span>
            <Button
              type="button"
              disabled={margin.isFetching}
              onClick={() => void margin.refetch()}
            >
              {t("retry")}
            </Button>
          </div>
        )}
      </dd>
    </div>
  );
}
