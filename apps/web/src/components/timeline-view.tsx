"use client";
import "../styles/timeline.css";
import type { Project } from "@taff/schemas";
import dynamic from "next/dynamic";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import { RouteLoading } from "./route-loading";

const Scene = dynamic(
  () => import("./timeline-scene").then((module) => module.TimelineView),
  { ssr: false, loading: RouteLoading },
);

export const TimelineView = memo(function TimelineView({
  project,
}: {
  project: Project | undefined;
}) {
  const { t } = useTranslation();
  if (!project)
    return (
      <p className="timeline-empty" data-testid="timeline-pick-project">
        {t("timeline.pickProject")}
      </p>
    );
  return <Scene project={project} />;
});
