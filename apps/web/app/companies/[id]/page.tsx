import { CompaniesView } from "../../../src/components/crm/companies-view";

export default async function Page({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return <CompaniesView companyId={id} />;
}
