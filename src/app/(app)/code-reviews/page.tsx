import { getUserFromAuthOrRedirect } from '@/lib/user.server';
import { ReviewAgentPageClient } from './ReviewAgentPageClient';

type ReviewAgentPageProps = {
  searchParams: Promise<{ success?: string; error?: string }>;
};

export default async function PersonalReviewAgentPage({ searchParams }: ReviewAgentPageProps) {
  const search = await searchParams;
  const user = await getUserFromAuthOrRedirect('/users/sign_in?callbackPath=/review-agent');

  return (
    <ReviewAgentPageClient
      userId={user.id}
      userName={user.google_user_name}
      successMessage={search.success}
      errorMessage={search.error}
    />
  );
}
