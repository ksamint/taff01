import dynamic from "next/dynamic";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { readServerMe } from "../../../src/lib/server-me";

const SystemAccessMatrix = dynamic(() =>
  import("../../../src/components/access-matrix").then(
    (module) => module.SystemAccessMatrix,
  ),
);
export default async function Page() {
  const me = await readServerMe(
    (await cookies()).toString(),
    process.env.API_INTERNAL_URL,
  );
  if (!me?.user.systemAdmin) notFound();
  return <SystemAccessMatrix />;
}
