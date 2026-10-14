"use client";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useDesktop } from "../lib/use-desktop";
import { useWorkspace } from "./app-shell";
import { TaskDetailView } from "./task-detail-view";
import { SheetDialog } from "./ui/sheet-dialog";

/**
 * `/tasks/[id]`: a modal sheet on phone; on desktop the prototype's right
 * panel beside the page it was opened from (the `@modal` intercept keeps that
 * page; a direct visit shows Today). Escape closes the panel and focus
 * returns to where it was.
 */
export function TaskDetailSheet({
  taskId,
  direct = false,
}: {
  taskId: string;
  direct?: boolean;
}) {
  const { confirmed } = useWorkspace();
  const router = useRouter();
  const { t } = useTranslation();
  const desktop = useDesktop();
  const close = () => (direct ? router.replace("/") : router.back());
  if (!confirmed) return null;
  return desktop ? (
    <TaskPanel label={t("agentProfile.task")} onClose={close}>
      <TaskDetailView taskId={taskId} embedded onClose={close} />
    </TaskPanel>
  ) : (
    <SheetDialog
      className="task-detail-sheet"
      title={t("agentProfile.task")}
      onClose={close}
    >
      <TaskDetailView taskId={taskId} embedded onClose={close} />
    </SheetDialog>
  );
}

function TaskPanel({
  label,
  onClose,
  children,
}: {
  label: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    ref.current?.focus();
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      // A dialog opened from the panel handles its own Escape.
      if (document.querySelector("dialog[open]")) return;
      close.current();
    };
    window.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("keydown", escape);
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);
  return (
    <aside
      ref={ref}
      className="task-panel"
      aria-label={label}
      tabIndex={-1}
      data-testid="task-panel"
    >
      {children}
    </aside>
  );
}
