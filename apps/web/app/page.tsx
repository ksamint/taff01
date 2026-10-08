import { AppShell } from "../src/components/app-shell";
import { TodayView } from "../src/components/today-view";

export default function Page() {
  return (
    <AppShell>
      <TodayView />
    </AppShell>
  );
}
