'use client';

import { Suspense } from 'react';
import { PageContainer } from '@/components/layouts/PageContainer';
import { EditWebhookTriggerContent } from './EditWebhookTriggerContent';

type EditWebhookTriggerPageProps = {
  params: Promise<{ triggerId: string }>;
};

export default function EditWebhookTriggerPage({ params }: EditWebhookTriggerPageProps) {
  return (
    <PageContainer>
      <Suspense
        fallback={<div className="flex h-screen items-center justify-center">Loading...</div>}
      >
        <EditWebhookTriggerContent params={params} />
      </Suspense>
    </PageContainer>
  );
}
