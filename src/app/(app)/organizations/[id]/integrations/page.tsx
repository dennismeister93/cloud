import { Suspense } from 'react';
import { IntegrationsPageClient } from './IntegrationsPageClient';
import { OrganizationByPageLayout } from '@/components/organizations/OrganizationByPageLayout';
import { getUserFromAuthOrRedirect } from '@/lib/user.server';
import { notFound } from 'next/navigation';
import { ENABLE_DEPLOY_FEATURE } from '@/lib/constants';

export default async function IntegrationsPage({ params }: { params: Promise<{ id: string }> }) {
  await getUserFromAuthOrRedirect('/users/sign_in');

  if (!ENABLE_DEPLOY_FEATURE) {
    return notFound();
  }

  return (
    <OrganizationByPageLayout
      params={params}
      render={({ organization }) => (
        <>
          <div>
            <h1 className="text-3xl font-bold">Integrations</h1>
            <p className="text-muted-foreground mt-2">
              Connect and manage platform integrations for {organization.name}
            </p>
          </div>

          <Suspense fallback={<div>Loading...</div>}>
            <IntegrationsPageClient organizationId={organization.id} />
          </Suspense>
        </>
      )}
    />
  );
}
