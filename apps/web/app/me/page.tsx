import { Suspense } from "react";
import { MeView } from "../../src/components/me-view";

export default function Page() {
  return (
    <Suspense fallback={null}>
      <MeView />
    </Suspense>
  );
}
