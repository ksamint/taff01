import { AppShell } from "../../src/components/app-shell";
import { ProjectsView } from "../../src/components/projects-view";

export default function Page() {
  return (
    <AppShell>
      <ProjectsView />
    </AppShell>
  );
}
