import { getUserFromAuthOrRedirect } from '@/lib/user.server';
import { AutoTriagePageClient } from './AutoTriagePageClient';
import { isFeatureFlagEnabled } from '@/lib/posthog-feature-flags';
import { notFound } from 'next/navigation';

type AutoTriagePageProps = {
  searchParams: Promise<{ success?: string; error?: string }>;
};

export default async function PersonalAutoTriagePage({ searchParams }: AutoTriagePageProps) {
  const search = await searchParams;
  const user = await getUserFromAuthOrRedirect('/users/sign_in?callbackPath=/auto-triage');

  // Feature flags - use server-side check with user ID as distinct ID
  const isAutoTriageFeatureEnabled = await isFeatureFlagEnabled('auto-triage-feature', user.id);
  const isDevelopment = process.env.NODE_ENV === 'development';

  if (!isAutoTriageFeatureEnabled && !isDevelopment) {
    return notFound();
  }

  return (
    <AutoTriagePageClient
      userId={user.id}
      userName={user.google_user_name}
      successMessage={search.success}
      errorMessage={search.error}
    />
  );
}
