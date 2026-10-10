import { TodayView } from "../src/components/today-view";

export default function Page() {
  return (
    <>
      <TodayView initialNow={Date.now()} />
    </>
  );
}
