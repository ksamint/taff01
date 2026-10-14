import { Suspense } from "react";
import { LazyBriefRoute } from "../../src/components/brief-lazy";
import { MeView } from "../../src/components/me-view";

// A direct visit shows 我的 under the overlay; closing returns to /me.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <MeView />
      <LazyBriefRoute direct />
    </Suspense>
  );
}
