import { AppShell } from "../../../../src/components/app-shell";
import { ReviewView } from "../../../../src/components/review-view";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AppShell>
      <ReviewView taskId={id} />
    </AppShell>
  );
}
