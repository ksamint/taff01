import { AppShell } from "../../../src/components/app-shell";
import { ProjectsView } from "../../../src/components/projects-view";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <AppShell>
      <ProjectsView projectId={id} />
    </AppShell>
  );
}
