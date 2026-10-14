import { Suspense } from "react";
import { LazyBriefRoute } from "../../src/components/brief-lazy";
import { MeView } from "../../src/components/me-view";

// 我的 renders under the phone overlay; closing returns to /me.
export default function Page() {
  return (
    <Suspense fallback={null}>
      <MeView />
      <LazyBriefRoute />
    </Suspense>
  );
}
