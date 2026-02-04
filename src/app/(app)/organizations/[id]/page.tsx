import { OrganizationDashboard } from '@/components/organizations/OrganizationDashboard';
import { OrganizationByPageLayout } from '@/components/organizations/OrganizationByPageLayout';
import { TOPUP_AMOUNT_QUERY_STRING_KEY } from '@/lib/organizations/constants';

export default async function OrganizationByIdPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string>>;
}) {
  const search = new URLSearchParams(await searchParams);
  const topupAmount = Number.parseFloat(search.get(TOPUP_AMOUNT_QUERY_STRING_KEY) || '0') || 0;
  return (
    <OrganizationByPageLayout
      params={params}
      render={({ role, organization }) => (
        <OrganizationDashboard
          organizationId={organization.id}
          role={role}
          topupAmount={topupAmount}
        />
      )}
    />
  );
}
