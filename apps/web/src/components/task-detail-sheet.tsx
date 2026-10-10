"use client";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { useWorkspace } from "./app-shell";
import { TaskDetailView } from "./task-detail-view";
import { SheetDialog } from "./ui/sheet-dialog";
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
  const close = () => (direct ? router.replace("/") : router.back());
  if (!confirmed) return null;
  return (
    <SheetDialog
      className="task-detail-sheet"
      title={t("agentProfile.task")}
      onClose={close}
    >
      <TaskDetailView taskId={taskId} embedded onClose={close} />
    </SheetDialog>
  );
}
