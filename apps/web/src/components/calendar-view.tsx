"use client";
import { useWorkspace } from "./app-shell";
import { CalendarScene } from "./calendar-scene";

export function CalendarView() {
  const { me, workspace } = useWorkspace();
  return <CalendarScene key={`${me.user.id}:${workspace.id}`} />;
}
