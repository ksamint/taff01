import { ProjectsView } from "../../../src/components/projects-view";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <>
      <ProjectsView projectId={id} />
    </>
  );
}
