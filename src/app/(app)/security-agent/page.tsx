import { SecurityAgentPageClient } from '@/components/security-agent';
import { PageContainer } from '@/components/layouts/PageContainer';
import { getUserFromAuthOrRedirect } from '@/lib/user.server';

export const metadata = {
  title: 'Security Agent | Kilo Code',
  description: 'Monitor and manage Dependabot security alerts',
};

export default async function SecurityAgentPage() {
  const user = await getUserFromAuthOrRedirect('/users/sign_in');

  return (
    <PageContainer>
      <SecurityAgentPageClient isAdmin={user.is_admin} />
    </PageContainer>
  );
}
