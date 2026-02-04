import { OrganizationByPageLayout } from '@/components/organizations/OrganizationByPageLayout';
import { CloudSessionsPage } from '@/components/cloud-agent/CloudSessionsPage';

export default async function OrganizationCloudPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <OrganizationByPageLayout
      params={params}
      render={({ organization }) => <CloudSessionsPage organizationId={organization.id} />}
    />
  );
}
