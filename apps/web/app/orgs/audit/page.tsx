import dynamic from "next/dynamic";

const AuditView = dynamic(() =>
  import("../../../src/components/audit-view").then(
    (module) => module.AuditView,
  ),
);
export default function Page() {
  return <AuditView />;
}
