import { AppShell } from "../../../src/components/app-shell";
import { DailyDigestView } from "../../../src/components/digest-view";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AppShell>
      <DailyDigestView id={id} />
    </AppShell>
  );
}
