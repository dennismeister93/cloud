'use client';

import { useEffect } from 'react';
import { toast } from 'sonner';
import { ReviewConfigForm } from '@/components/code-reviews/ReviewConfigForm';
import { CodeReviewJobsCard } from '@/components/code-reviews/CodeReviewJobsCard';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Rocket, ExternalLink, Settings2, ListChecks } from 'lucide-react';
import { useTRPC } from '@/lib/trpc/utils';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { PageContainer } from '@/components/layouts/PageContainer';

type ReviewAgentPageClientProps = {
  userId: string;
  userName: string;
  successMessage?: string;
  errorMessage?: string;
};

export function ReviewAgentPageClient({
  successMessage,
  errorMessage,
}: ReviewAgentPageClientProps) {
  const trpc = useTRPC();

  // Fetch GitHub App installation status
  const { data: statusData } = useQuery(trpc.personalReviewAgent.getGitHubStatus.queryOptions());

  const isGitHubAppInstalled = statusData?.connected && statusData?.integration?.isValid;

  // Show toast messages from URL params
  useEffect(() => {
    if (successMessage === 'github_connected') {
      toast.success('GitHub account connected successfully');
    }
    if (errorMessage) {
      toast.error('An error occurred', {
        description: errorMessage.replace(/_/g, ' '),
      });
    }
  }, [successMessage, errorMessage]);

  return (
    <PageContainer>
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <h1 className="text-3xl font-bold">Code Reviewer</h1>
          <Badge variant="new">new</Badge>
        </div>
        <p className="text-muted-foreground">
          Automate code reviews with AI-powered analysis for your personal repositories
        </p>
        <a
          href="https://kilo.ai/docs/advanced-usage/code-reviews"
          target="_blank"
          rel="noopener noreferrer"
          className="mt-2 inline-flex items-center gap-1 text-sm text-blue-400 hover:text-blue-300"
        >
          Learn how to use it
          <ExternalLink className="size-4" />
        </a>
      </div>

      {/* GitHub App Required Alert */}
      {!isGitHubAppInstalled && (
        <Alert>
          <Rocket className="h-4 w-4" />
          <AlertTitle>GitHub App Required</AlertTitle>
          <AlertDescription className="space-y-3">
            <p>
              The Kilo GitHub App must be installed to use Code Reviewer. The app automatically
              manages workflows and triggers reviews on your pull requests.
            </p>
            <Link href="/integrations/github">
              <Button variant="default" size="sm">
                Install GitHub App
                <ExternalLink className="ml-2 h-3 w-3" />
              </Button>
            </Link>
          </AlertDescription>
        </Alert>
      )}

      {/* Tabbed Content */}
      <Tabs defaultValue="config" className="w-full">
        <TabsList className="grid w-full max-w-2xl grid-cols-2">
          <TabsTrigger value="config" className="flex items-center gap-2">
            <Settings2 className="h-4 w-4" />
            Config
          </TabsTrigger>
          <TabsTrigger
            value="jobs"
            className="flex items-center gap-2"
            disabled={!isGitHubAppInstalled}
          >
            <ListChecks className="h-4 w-4" />
            Jobs
          </TabsTrigger>
        </TabsList>

        {/* Configuration Tab */}
        <TabsContent value="config" className="mt-6 space-y-4">
          <ReviewConfigForm />
        </TabsContent>

        {/* Jobs Tab */}
        <TabsContent value="jobs" className="mt-6 space-y-4">
          {isGitHubAppInstalled ? (
            <CodeReviewJobsCard />
          ) : (
            <Alert>
              <ListChecks className="h-4 w-4" />
              <AlertTitle>No Jobs Yet</AlertTitle>
              <AlertDescription>
                Install the GitHub App and configure your review settings to see code review jobs
                here.
              </AlertDescription>
            </Alert>
          )}
        </TabsContent>
      </Tabs>
    </PageContainer>
  );
}
