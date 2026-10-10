import { ReviewView } from "../../../../src/components/review-view";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <>
      <ReviewView taskId={id} />
    </>
  );
}
