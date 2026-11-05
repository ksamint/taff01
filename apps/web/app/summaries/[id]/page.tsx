import { SummaryView } from "../../../src/components/summaries-view";
export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <SummaryView id={id} />;
}
