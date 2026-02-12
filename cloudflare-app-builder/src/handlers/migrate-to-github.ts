/**
 * Migrate to GitHub endpoint handler
 * POST /apps/{app-id}/migrate-to-github
 *
 * Pushes the internal repository to GitHub, then configures the preview
 * to clone from GitHub and schedules deletion of the internal git repo.
 */

import { sanitizeGitUrl } from 'cloudflare-utils';
import { logger } from '../utils/logger';
import { verifyBearerToken } from '../utils/auth';
import type { Env } from '../types';
import { MigrateToGithubRequestSchema } from '../api-schemas';

export async function handleMigrateToGithub(
  request: Request,
  env: Env,
  appId: string
): Promise<Response> {
  try {
    const authResult = verifyBearerToken(request, env);
    if (!authResult.isAuthenticated) {
      if (!authResult.errorResponse) {
        return new Response('Unauthorized', { status: 401 });
      }
      return authResult.errorResponse;
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'invalid_request',
          message: 'Invalid JSON',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const result = MigrateToGithubRequestSchema.safeParse(body);
    if (!result.success) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'invalid_request',
          message: result.error.issues[0]?.message ?? 'Invalid request body',
        }),
        {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    const { remoteUrl, remoteAuthToken, githubRepo, userId, orgId } = result.data;

    // 1. Push internal git repo to GitHub
    const gitId = env.GIT_REPOSITORY.idFromName(appId);
    const gitStub = env.GIT_REPOSITORY.get(gitId);

    const isInitialized = await gitStub.isInitialized();
    if (!isInitialized) {
      return new Response(
        JSON.stringify({
          success: false,
          error: 'internal_error',
          message: 'Repository not found',
        }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    }

    logger.info({ source: 'MigrateToGithubHandler', appId }, 'Pushing repository to remote', {
      remoteUrl: sanitizeGitUrl(remoteUrl),
    });

    const pushResult = await gitStub.pushToRemote(remoteUrl, remoteAuthToken);
    if (!pushResult.success) {
      logger.error({ source: 'MigrateToGithubHandler', appId }, 'Failed to push to remote', {
        error: pushResult.error,
      });
      return new Response(
        JSON.stringify({
          success: false,
          error: 'push_failed',
          message: pushResult.error || 'Failed to push to remote',
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 2. Switch preview to GitHub source and schedule internal repo deletion
    logger.info({ source: 'MigrateToGithubHandler', appId }, 'Migrating preview to GitHub', {
      githubRepo,
      hasOrgId: !!orgId,
    });

    const previewId = env.PREVIEW.idFromName(appId);
    const previewStub = env.PREVIEW.get(previewId);

    await previewStub.migrateToGithub({ githubRepo, userId, orgId });

    logger.info({ source: 'MigrateToGithubHandler', appId }, 'Successfully migrated to GitHub');

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    logger.error({ source: 'MigrateToGithubHandler' }, 'Migrate to GitHub handler error', error);
    return new Response(
      JSON.stringify({
        success: false,
        error: 'internal_error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
