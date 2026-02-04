import { redirect } from 'next/navigation';
import { AppBuilderPage } from '@/components/app-builder/AppBuilderPage';
import { getAuthorizedOrgContext } from '@/lib/organizations/organization-auth';

type Props = {
  params: Promise<{ id: string }>;
};

export default async function OrgAppBuilderPage({ params }: Props) {
  const { id } = await params;
  const organizationId = decodeURIComponent(id);

  // Auth check - redirect if not authorized
  const { success } = await getAuthorizedOrgContext(organizationId);
  if (!success) {
    redirect('/profile');
  }

  return <AppBuilderPage organizationId={organizationId} projectId={undefined} />;
}
