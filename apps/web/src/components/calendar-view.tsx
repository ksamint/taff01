"use client";
import "@schedule-x/theme-default/dist/index.css";
import "../styles/calendar.css";
import dynamic from "next/dynamic";
import { withTemporal } from "../lib/temporal";
import { useWorkspace } from "./app-shell";
import { RouteLoading } from "./route-loading";

const Scene = dynamic(
  () =>
    withTemporal(() => import("./calendar-scene")).then(
      (module) => module.CalendarScene,
    ),
  { loading: RouteLoading },
);
export function CalendarView() {
  const { me, workspace } = useWorkspace();
  return <Scene key={`${me.user.id}:${workspace.id}`} />;
}
