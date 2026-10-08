import { AgentProfileView } from "../../../src/components/agent-profile-view";
import { AppShell } from "../../../src/components/app-shell";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AppShell>
      <AgentProfileView agentId={id} />
    </AppShell>
  );
}
