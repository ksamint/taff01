import { AgentProfileView } from "../../../src/components/agent-profile-view";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <>
      <AgentProfileView agentId={id} />
    </>
  );
}
