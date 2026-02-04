import { getUserFromAuthOrRedirect } from '@/lib/user.server';
import { CodeIndexingView } from '@/components/code-indexing/CodeIndexingView';
import { isEnabledForUser } from '@/lib/code-indexing/util';
import { Badge } from '@/components/ui/badge';
import { ExternalLink } from 'lucide-react';
import { PageContainer } from '@/components/layouts/PageContainer';

export default async function UserCodeIndexingPage() {
  const user = await getUserFromAuthOrRedirect('/users/sign_in');

  const isEnabled = isEnabledForUser(user);

  return (
    <PageContainer>
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <h1 className="text-foreground text-3xl font-bold">Managed Indexing</h1>
            <Badge variant="new">new</Badge>
          </div>
          <p className="text-muted-foreground">View and manage your indexed code</p>
          <a
            href="https://kilo.ai/docs/advanced-usage/managed-indexing"
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 inline-flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300"
          >
            Learn how to use it
            <ExternalLink className="size-4" />
          </a>
        </div>
      </div>
      <CodeIndexingView
        organizationId={null}
        isEnabled={isEnabled}
        canDelete={true}
        isAdminView={false}
      />
    </PageContainer>
  );
}
