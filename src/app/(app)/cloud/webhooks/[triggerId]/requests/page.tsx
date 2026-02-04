'use client';

import { Suspense } from 'react';
import { PageContainer } from '@/components/layouts/PageContainer';
import { WebhookRequestsContent } from './WebhookRequestsContent';

type WebhookRequestsPageProps = {
  params: Promise<{ triggerId: string }>;
};

export default function WebhookRequestsPage({ params }: WebhookRequestsPageProps) {
  return (
    <PageContainer>
      <Suspense
        fallback={<div className="flex h-screen items-center justify-center">Loading...</div>}
      >
        <WebhookRequestsContent params={params} />
      </Suspense>
    </PageContainer>
  );
}
