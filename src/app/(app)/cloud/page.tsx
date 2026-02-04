import { getUserFromAuthOrRedirect } from '@/lib/user.server';
import { CloudSessionsPage } from '@/components/cloud-agent/CloudSessionsPage';

export default async function PersonalCloudPage() {
  await getUserFromAuthOrRedirect('/users/sign_in?callbackPath=/cloud');

  return <CloudSessionsPage />;
}
