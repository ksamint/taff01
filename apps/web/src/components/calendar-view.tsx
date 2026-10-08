"use client";
import dynamic from "next/dynamic";
import { useWorkspace } from "./app-shell";

const Scene = dynamic(
  () => import("./calendar-scene").then((module) => module.CalendarScene),
  { ssr: false },
);
export function CalendarView() {
  const { me, workspace } = useWorkspace();
  return <Scene key={`${me.user.id}:${workspace.id}`} />;
}
