import { TaskDetailSheet } from "../../../../src/components/task-detail-sheet";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <TaskDetailSheet taskId={id} />;
}
