import { AppShell } from "../../src/components/app-shell";
import { DailyDigestsView } from "../../src/components/digest-view";
export default function Page() {
  return (
    <AppShell>
      <DailyDigestsView />
    </AppShell>
  );
}
