import dynamic from "next/dynamic";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { readServerMe } from "../../src/lib/server-me";

const WorkspaceAdministration = dynamic(() =>
  import("../../src/components/workspace-lifecycle").then(
    (module) => module.WorkspaceAdministration,
  ),
);
export default async function Page() {
  const me = await readServerMe(
    (await cookies()).toString(),
    process.env.API_INTERNAL_URL,
  );
  if (!me?.user.systemAdmin) notFound();
  return <WorkspaceAdministration />;
}
