import { TaskDetailSheet } from "../../../src/components/task-detail-sheet";
import { TodayView } from "../../../src/components/today-view";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <>
      <TodayView initialNow={Date.now()} />
      <TaskDetailSheet taskId={id} direct />
    </>
  );
}
