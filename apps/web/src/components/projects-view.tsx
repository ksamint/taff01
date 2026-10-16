"use client";
import "../styles/projects.css";
import dynamic from "next/dynamic";
import { RouteLoading } from "./route-loading";

const Scene = dynamic(
  () => import("./projects-scene").then((module) => module.ProjectsView),
  { ssr: false, loading: RouteLoading },
);

export function ProjectsView({ projectId }: { projectId?: string }) {
  return <Scene projectId={projectId} />;
}
