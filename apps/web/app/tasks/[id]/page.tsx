import { AppShell } from "../../../src/components/app-shell";
import { TaskDetailView } from "../../../src/components/task-detail-view";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AppShell>
      <TaskDetailView taskId={id} />
    </AppShell>
  );
}
