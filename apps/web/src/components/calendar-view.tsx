"use client";
import dynamic from "next/dynamic";
import { useWorkspace } from "./app-shell";
import { RouteLoading } from "./route-loading";

const Scene = dynamic(
  () => import("./calendar-scene").then((module) => module.CalendarScene),
  { ssr: false, loading: RouteLoading },
);
export function CalendarView() {
  const { me, workspace } = useWorkspace();
  return <Scene key={`${me.user.id}:${workspace.id}`} />;
}
