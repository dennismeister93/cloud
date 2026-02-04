import { OrganizationByPageLayout } from '@/components/organizations/OrganizationByPageLayout';
import { OrganizationPaymentDetails } from '@/components/organizations/OrganizationPaymentDetails';

export default async function OrganizationPaymentDetailsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <OrganizationByPageLayout
      params={params}
      render={({ role, organization }) => (
        <OrganizationPaymentDetails organizationId={organization.id} role={role} />
      )}
    />
  );
}
