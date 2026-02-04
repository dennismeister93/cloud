/**
 * App Builder Preview
 *
 * Preview pane component with iframe.
 * Uses ProjectSession context hooks for state and actions.
 * Shows different states: idle, building, running, error.
 */

'use client';

import { useState, useCallback, useEffect, memo } from 'react';
import Link from 'next/link';
import {
  Loader2,
  RefreshCw,
  Maximize2,
  Minimize2,
  ExternalLink,
  AlertCircle,
  Rocket,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useTRPC } from '@/lib/trpc/utils';
import { useQuery } from '@tanstack/react-query';
import { DEPLOYMENT_POLL_INTERVAL_MS } from '@/lib/user-deployments/constants';
import { isDeploymentInProgress, type BuildStatus } from '@/lib/user-deployments/types';
import { CloneDialog } from './CloneDialog';
import { useProject } from './ProjectSession';
import { toast } from 'sonner';

type AppBuilderPreviewProps = {
  organizationId?: string;
};

function IdleState() {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <div className="bg-muted mb-4 rounded-full p-6">
        <Loader2 className="text-muted-foreground h-8 w-8 animate-spin" />
      </div>
      <h3 className="text-lg font-medium">Waiting for build environment</h3>
      <p className="text-muted-foreground mt-2 max-w-sm text-sm">
        Setting up the environment for your live preview...
      </p>
    </div>
  );
}

function BuildingState() {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <div className="bg-muted mb-4 rounded-full p-6">
        <Loader2 className="text-primary h-8 w-8 animate-spin" />
      </div>
      <h3 className="text-lg font-medium">Starting live preview</h3>
      <p className="text-muted-foreground mt-2 max-w-sm text-sm">
        Your app is being built. This usually takes a few moments...
      </p>
      <div className="mt-4 flex items-center gap-2">
        <div className="bg-primary h-2 w-2 animate-pulse rounded-full" />
        <div className="bg-primary h-2 w-2 animate-pulse rounded-full [animation-delay:0.2s]" />
        <div className="bg-primary h-2 w-2 animate-pulse rounded-full [animation-delay:0.4s]" />
      </div>
    </div>
  );
}

function ErrorState({ onRetry }: { onRetry?: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center text-center">
      <div className="mb-4 rounded-full bg-red-500/10 p-6">
        <AlertCircle className="h-8 w-8 text-red-500" />
      </div>
      <h3 className="text-lg font-medium">Preview Failed</h3>
      <p className="text-muted-foreground mt-2 max-w-sm text-sm">
        Something went wrong while building the preview. Please try again or check the chat for
        error details.
      </p>
      {onRetry && (
        <Button variant="outline" className="mt-4" onClick={onRetry}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Retry
        </Button>
      )}
    </div>
  );
}

/**
 * Loading overlay shown while iframe content is loading
 */
function IframeLoadingOverlay() {
  return (
    <div className="bg-background/80 absolute inset-0 z-10 flex flex-col items-center justify-center backdrop-blur-sm">
      <div className="bg-muted mb-4 rounded-full p-6">
        <Loader2 className="text-primary h-8 w-8 animate-spin" />
      </div>
      <h3 className="text-lg font-medium">Loading preview</h3>
      <p className="text-muted-foreground mt-2 max-w-sm text-center text-sm">
        Starting your app... This may take a moment on first load.
      </p>
      <div className="mt-4 flex items-center gap-2">
        <div className="bg-primary h-2 w-2 animate-pulse rounded-full" />
        <div className="bg-primary h-2 w-2 animate-pulse rounded-full [animation-delay:0.2s]" />
        <div className="bg-primary h-2 w-2 animate-pulse rounded-full [animation-delay:0.4s]" />
      </div>
    </div>
  );
}

type PreviewFrameProps = {
  url: string;
  isFullscreen: boolean;
  onRefresh: () => void;
  onToggleFullscreen: () => void;
  onOpenExternal: () => void;
};

/**
 * Preview frame controls bar
 */
function PreviewControls({
  url,
  isFullscreen,
  onRefresh,
  onToggleFullscreen,
  onOpenExternal,
}: PreviewFrameProps) {
  return (
    <div className="flex items-center justify-between gap-4 border-b px-4 py-2">
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="text-muted-foreground min-w-0 flex-1 truncate text-xs">{url}</span>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="sm" onClick={onRefresh} title="Refresh preview">
          <RefreshCw className="h-4 w-4" />
        </Button>
        <Button variant="ghost" size="sm" onClick={onOpenExternal} title="Open in new tab">
          <ExternalLink className="h-4 w-4" />
        </Button>
        <Button
          variant="ghost"
          size="sm"
          onClick={onToggleFullscreen}
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        >
          {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
        </Button>
      </div>
    </div>
  );
}

const isDev = process.env.NODE_ENV === 'development';

/** In dev, remove subdomain: "https://app-id.builder.kiloapps.io/path" -> "https://builder.kiloapps.io/" */
function getPreviewUrl(url: string): string {
  if (!isDev) return url;
  try {
    const parsed = new URL(url);
    const parts = parsed.hostname.split('.');
    if (parts.length > 2) {
      parsed.hostname = parts.slice(1).join('.');
    }
    parsed.pathname = '/';
    return parsed.toString();
  } catch {
    return url;
  }
}

/**
 * Preview iframe with controls - renders dev or production iframe based on environment
 */
function PreviewFrame(props: PreviewFrameProps) {
  const { url, isFullscreen } = props;
  const [isIframeLoading, setIsIframeLoading] = useState(true);

  // Reset loading state when URL changes
  useEffect(() => {
    setIsIframeLoading(true);
  }, [url]);

  const handleIframeLoad = useCallback(() => {
    setIsIframeLoading(false);
  }, []);

  return (
    <div className={cn('flex h-full flex-col', isFullscreen && 'bg-background fixed inset-0 z-50')}>
      <PreviewControls {...props} />
      <div className="relative flex-1">
        {isIframeLoading && <IframeLoadingOverlay />}
        <iframe
          src={getPreviewUrl(url)}
          className="h-full w-full border-0"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          title="App Preview"
          onLoad={handleIframeLoad}
        />
      </div>
    </div>
  );
}

type DeploymentState =
  | { kind: 'creating' }
  | { kind: 'in-progress'; buildStatus: BuildStatus; deploymentId: string }
  | { kind: 'deployed'; deploymentUrl: string; deploymentId: string }
  | { kind: 'failed'; deploymentId: string }
  | { kind: 'ready-to-deploy' }
  | { kind: 'hidden' };

function getDeploymentState({
  isCreatingDeployment,
  deploymentId,
  buildStatus,
  deploymentUrl,
  previewStatus,
}: {
  isCreatingDeployment: boolean;
  deploymentId: string | null;
  buildStatus?: BuildStatus;
  deploymentUrl?: string | null;
  previewStatus: string;
}): DeploymentState {
  if (!deploymentId) {
    if (isCreatingDeployment) return { kind: 'creating' };

    if (previewStatus === 'running') {
      return { kind: 'ready-to-deploy' };
    }
  } else {
    // buildStatus not yet loaded - show as in-progress while waiting for query
    if (!buildStatus) {
      return { kind: 'in-progress', buildStatus: 'queued', deploymentId };
    }
    if (isDeploymentInProgress(buildStatus)) {
      return { kind: 'in-progress', buildStatus, deploymentId };
    }
    if (buildStatus === 'deployed' && deploymentUrl) {
      return { kind: 'deployed', deploymentUrl, deploymentId };
    }
    if (buildStatus === 'failed') {
      return { kind: 'failed', deploymentId };
    }
  }

  return { kind: 'hidden' };
}

const statusLabels: Record<BuildStatus, string> = {
  queued: 'Queued',
  building: 'Building',
  deploying: 'Deploying',
  deployed: 'Deployed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

function DeploymentControls({ state, onDeploy }: { state: DeploymentState; onDeploy: () => void }) {
  switch (state.kind) {
    case 'creating':
      return (
        <Button size="sm" variant="outline" disabled>
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          Creating...
        </Button>
      );
    case 'in-progress':
      return (
        <Button size="sm" variant="outline" asChild>
          <Link href={`/deploy/`} target="_blank">
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            {statusLabels[state.buildStatus]}...
          </Link>
        </Button>
      );
    case 'deployed':
      return (
        <Button size="sm" variant="outline" asChild>
          <a href={state.deploymentUrl} target="_blank" rel="noopener noreferrer">
            <ExternalLink className="mr-2 h-4 w-4" />
            View Site
          </a>
        </Button>
      );
    case 'failed':
      return (
        <Button size="sm" variant="outline" className="text-red-400" asChild>
          <Link href={`/deploy/`} target="_blank">
            <AlertCircle className="mr-2 h-4 w-4" />
            Failed - View Logs
          </Link>
        </Button>
      );
    case 'ready-to-deploy':
      return (
        <Button
          size="sm"
          variant="outline"
          onClick={onDeploy}
          className="border-yellow-500/50 bg-yellow-500/10 text-yellow-400 hover:bg-yellow-500/20"
        >
          <Rocket className="mr-2 h-4 w-4" />
          Deploy
        </Button>
      );
    case 'hidden':
      return null;
  }
}

/**
 * Main preview component
 */
export const AppBuilderPreview = memo(function AppBuilderPreview({
  organizationId,
}: AppBuilderPreviewProps) {
  // Get state and manager from ProjectSession context
  const { manager, state } = useProject();
  const { previewUrl, previewStatus, deploymentId } = state;
  const projectId = manager.projectId;

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [iframeKey, setIframeKey] = useState(0);
  const [isCreatingDeployment, setIsCreatingDeployment] = useState(false);

  // Get tRPC for queries
  const trpc = useTRPC();

  // Poll deployment status when we have a deploymentId
  // Use org-specific or personal query based on context
  const personalDeploymentQuery = useQuery({
    ...trpc.deployments.getDeployment.queryOptions({ id: deploymentId ?? '' }),
    enabled: !!deploymentId && !organizationId,
    refetchInterval: query => {
      const status = query.state.data?.latestBuild?.status;
      return isDeploymentInProgress(status) ? DEPLOYMENT_POLL_INTERVAL_MS : false;
    },
  });
  const orgDeploymentQuery = useQuery({
    ...trpc.organizations.deployments.getDeployment.queryOptions({
      id: deploymentId ?? '',
      organizationId: organizationId ?? '',
    }),
    enabled: !!deploymentId && !!organizationId,
    refetchInterval: query => {
      const status = query.state.data?.latestBuild?.status;
      return isDeploymentInProgress(status) ? DEPLOYMENT_POLL_INTERVAL_MS : false;
    },
  });
  const deploymentData = organizationId ? orgDeploymentQuery.data : personalDeploymentQuery.data;

  const buildStatus = deploymentData?.latestBuild?.status;
  const deploymentUrl = deploymentData?.deployment?.deployment_url;

  // Periodic ping to keep sandbox alive (pauses when tab is hidden)
  useEffect(() => {
    if (previewStatus !== 'running' || !previewUrl) return;

    const ping = () => void fetch(previewUrl, { method: 'HEAD' }).catch(() => {});

    let intervalId: ReturnType<typeof setInterval> | null = null;

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        if (!intervalId) {
          ping();
          intervalId = setInterval(ping, 20000);
        }
      } else if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };

    handleVisibilityChange();
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      if (intervalId) clearInterval(intervalId);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [previewUrl, previewStatus]);

  const handleRefresh = useCallback(() => {
    setIframeKey(prev => prev + 1);
  }, []);

  const handleToggleFullscreen = useCallback(() => {
    setIsFullscreen(prev => !prev);
  }, []);

  const handleOpenExternal = useCallback(() => {
    if (previewUrl) {
      window.open(previewUrl, '_blank');
    }
  }, [previewUrl]);

  // Handle deploy using ProjectManager
  const handleDeploy = useCallback(async () => {
    setIsCreatingDeployment(true);
    try {
      const result = await manager.deploy();
      if (!result.success && result.error === 'payment_required') {
        toast('Payment required to create deployments.', {
          description: 'Visit the billing page to add a payment method.',
        });
      }
    } catch (error) {
      console.error('Deployment failed:', error);
    } finally {
      setIsCreatingDeployment(false);
    }
  }, [manager]);

  const deploymentState = getDeploymentState({
    isCreatingDeployment,
    deploymentId,
    buildStatus,
    deploymentUrl,
    previewStatus,
  });

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex h-12 items-center justify-between gap-4 border-b px-4">
        <h2 className="shrink-0 text-sm font-medium">Preview</h2>

        <div className="flex items-center gap-2">
          {projectId && <CloneDialog projectId={projectId} organizationId={organizationId} />}
          <DeploymentControls state={deploymentState} onDeploy={handleDeploy} />
        </div>
      </div>

      {/* Content */}
      <div className="flex-1">
        {previewStatus === 'idle' && <IdleState />}
        {previewStatus === 'building' && <BuildingState />}
        {previewStatus === 'error' && <ErrorState />}
        {previewStatus === 'running' && !previewUrl && <ErrorState />}
        {previewStatus === 'running' && previewUrl && (
          <PreviewFrame
            key={iframeKey}
            url={previewUrl}
            isFullscreen={isFullscreen}
            onRefresh={handleRefresh}
            onToggleFullscreen={handleToggleFullscreen}
            onOpenExternal={handleOpenExternal}
          />
        )}
      </div>
    </div>
  );
});
