import dynamic from "next/dynamic";

const AccessMatrix = dynamic(() =>
  import("../../../src/components/access-matrix").then(
    (module) => module.AccessMatrix,
  ),
);
export default function Page() {
  return <AccessMatrix />;
}
