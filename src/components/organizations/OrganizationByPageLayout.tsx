'use server';
import { getAuthorizedOrgContext } from '@/lib/organizations/organization-auth';
import type { OrganizationRole } from '@/lib/organizations/organization-types';
import type { Organization } from '@/db/schema';
import { redirect } from 'next/navigation';
import type { JSX } from 'react';
import { OrganizationTrialWrapper } from './OrganizationTrialWrapper';

export async function OrganizationByPageLayout({
  params,
  render,
}: {
  params: Promise<{ id: string }>;
  render: ({
    role,
    organization,
  }: {
    role: OrganizationRole;
    organization: Organization;
  }) => JSX.Element;
}) {
  const { id } = await params;
  const organizationId = decodeURIComponent(id);
  const { success, data } = await getAuthorizedOrgContext(organizationId);
  if (!success) {
    redirect('/profile');
  }
  const { user, organization } = data;
  const role = user.is_admin ? 'owner' : user.role;
  return (
    <OrganizationTrialWrapper organizationId={organization.id}>
      {render({ role, organization })}
    </OrganizationTrialWrapper>
  );
}
