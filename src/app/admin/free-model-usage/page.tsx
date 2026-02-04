'use client';

import { Suspense } from 'react';
import { FreeModelUsageStats } from '../components/FreeModelUsageStats';
import AdminPage from '../components/AdminPage';
import { BreadcrumbItem, BreadcrumbPage } from '@/components/ui/breadcrumb';

const breadcrumbs = (
  <>
    <BreadcrumbItem>
      <BreadcrumbPage>Free Model Rate Limited Usage</BreadcrumbPage>
    </BreadcrumbItem>
  </>
);

export default function FreeModelUsagePage() {
  return (
    <AdminPage breadcrumbs={breadcrumbs}>
      <div className="flex w-full flex-col gap-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold">Free Model Rate Limited Usage</h2>
        </div>

        <p className="text-muted-foreground">
          Monitor IP-based rate limiting for free model usage. This applies to both anonymous and
          authenticated users. Rate limiting is based on request count per IP address within a
          rolling window.
        </p>

        <Suspense fallback={<div>Loading free model usage statistics...</div>}>
          <FreeModelUsageStats />
        </Suspense>
      </div>
    </AdminPage>
  );
}
