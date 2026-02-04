import { useCallback } from 'react';
import { useSetAtom } from 'jotai';
import { useRawTRPCClient } from '@/lib/trpc/utils';
import {
  linkCloudAgentSessionAtom,
  updateCloudAgentSessionIdAtom,
} from '../store/db-session-atoms';

export type PrepareSessionConfig = {
  prompt: string;
  mode: 'architect' | 'code' | 'ask' | 'debug' | 'orchestrator';
  model: string;
  githubRepo?: string;
  gitlabProject?: string;
  envVars?: Record<string, string>;
  setupCommands?: string[];
  autoCommit?: boolean;
  profileName?: string;
};

export type UsePreparedSessionOptions = {
  organizationId?: string;
  kiloSessionId?: string;
};

export function usePreparedSession(options: UsePreparedSessionOptions = {}) {
  const trpcClient = useRawTRPCClient();
  const updateCloudAgentSessionIdAction = useSetAtom(updateCloudAgentSessionIdAtom);
  const linkCloudAgentSession = useSetAtom(linkCloudAgentSessionAtom);
  const { organizationId, kiloSessionId } = options;

  const prepareSession = useCallback(
    async (config: PrepareSessionConfig): Promise<string> => {
      const result = organizationId
        ? await trpcClient.organizations.cloudAgent.prepareSession.mutate({
            ...config,
            organizationId,
          })
        : await trpcClient.cloudAgent.prepareSession.mutate(config);

      if (kiloSessionId) {
        await updateCloudAgentSessionIdAction({
          sessionId: kiloSessionId,
          cloudAgentSessionId: result.cloudAgentSessionId,
        });
      }
      linkCloudAgentSession(result.cloudAgentSessionId);

      return result.cloudAgentSessionId;
    },
    [
      trpcClient,
      updateCloudAgentSessionIdAction,
      linkCloudAgentSession,
      organizationId,
      kiloSessionId,
    ]
  );

  return { prepareSession };
}
