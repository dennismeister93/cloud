import { SecurityAgentPageClient } from '@/components/security-agent';
import { PageContainer } from '@/components/layouts/PageContainer';
import { getUserFromAuthOrRedirect } from '@/lib/user.server';

export const metadata = {
  title: 'Security Agent | Kilo Code',
  description: 'Monitor and manage Dependabot security alerts',
};

type PageProps = {
  params: Promise<{ id: string }>;
};

export default async function OrganizationSecurityAgentPage({ params }: PageProps) {
  const { id: organizationId } = await params;
  const user = await getUserFromAuthOrRedirect('/users/sign_in');

  return (
    <PageContainer>
      <SecurityAgentPageClient organizationId={organizationId} isAdmin={user.is_admin} />
    </PageContainer>
  );
}
