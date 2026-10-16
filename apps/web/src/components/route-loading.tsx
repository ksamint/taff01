"use client";
import { useTranslation } from "react-i18next";

export function RouteLoading() {
  const { t } = useTranslation();
  return (
    <p className="loading" role="status">
      {t("loading")}
    </p>
  );
}
