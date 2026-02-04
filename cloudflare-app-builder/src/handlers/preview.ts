import { logger, formatError } from '../utils/logger';
import { verifyBearerToken } from '../utils/auth';
import { DEFAULT_SANDBOX_PORT, type Env } from '../types';
import type { PreviewDO } from '../preview-do';
import { getSandbox } from '@cloudflare/sandbox';
import { switchPort } from '@cloudflare/containers';

function getPreviewDO(appId: string, env: Env): DurableObjectStub<PreviewDO> {
  const id = env.PREVIEW.idFromName(appId);
  return env.PREVIEW.get(id);
}

export async function handleGetPreviewStatus(
  request: Request,
  env: Env,
  appId: string
): Promise<Response> {
  try {
    // 1. Verify Bearer token authentication
    const authResult = verifyBearerToken(request, env);
    if (!authResult.isAuthenticated) {
      if (!authResult.errorResponse) {
        return new Response('Unauthorized', { status: 401 });
      }
      return authResult.errorResponse;
    }

    const previewStub = getPreviewDO(appId, env);
    const { state, error } = await previewStub.getStatus();

    const previewUrl = state === 'running' ? `https://${appId}.${env.BUILDER_HOSTNAME}` : null;

    return new Response(
      JSON.stringify({
        status: state,
        previewUrl,
        error,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    logger.error('Preview status error', formatError(error));
    return new Response(
      JSON.stringify({
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

export async function handleTriggerBuild(
  request: Request,
  env: Env,
  appId: string
): Promise<Response> {
  try {
    // 1. Verify Bearer token authentication
    const authResult = verifyBearerToken(request, env);
    if (!authResult.isAuthenticated) {
      if (!authResult.errorResponse) {
        return new Response('Unauthorized', { status: 401 });
      }
      return authResult.errorResponse;
    }

    const previewStub = getPreviewDO(appId, env);
    await previewStub.triggerBuild();

    return new Response('', {
      status: 202, // Accepted - build is running asynchronously
    });
  } catch (error) {
    logger.error('Trigger build error', formatError(error));
    return new Response(
      JSON.stringify({
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

export async function handleStreamBuildLogs(
  request: Request,
  env: Env,
  appId: string
): Promise<Response> {
  try {
    // 1. Verify Bearer token authentication
    const authResult = verifyBearerToken(request, env);
    if (!authResult.isAuthenticated) {
      if (!authResult.errorResponse) {
        return new Response('Unauthorized', { status: 401 });
      }
      return authResult.errorResponse;
    }

    const previewStub = getPreviewDO(appId, env);
    const logStream = await previewStub.streamBuildLogs();

    if (!logStream) {
      return new Response(
        JSON.stringify({
          error: 'no_logs_available',
          message: 'No build process is currently running or process ID not available',
        }),
        {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }

    // Return the stream as Server-Sent Events
    return new Response(logStream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  } catch (error) {
    logger.error('Stream build logs error', formatError(error));
    return new Response(
      JSON.stringify({
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

export async function handlePreviewProxy(
  request: Request,
  env: Env,
  appId: string
): Promise<Response> {
  try {
    const sandbox = getSandbox(env.SANDBOX, appId);

    // Detect WebSocket upgrade request
    const upgradeHeader = request.headers.get('Upgrade');
    const isWebSocket = upgradeHeader?.toLowerCase() === 'websocket';

    const url = new URL(request.url);

    const port = DEFAULT_SANDBOX_PORT;
    const proxyUrl = new URL(request.url);
    proxyUrl.hostname = 'localhost';
    proxyUrl.port = String(port);
    proxyUrl.protocol = 'http:';

    if (isWebSocket) {
      // WebSocket: Use sandbox.fetch() with switchPort
      const wsRequest = new Request(proxyUrl, request);
      try {
        const response = await sandbox.fetch(switchPort(wsRequest, port));
        return response;
      } catch (error) {
        logger.error('WebSocket proxy error', formatError(error));
        return new Response(
          JSON.stringify({
            error: 'proxy_error',
            message: error instanceof Error ? error.message : 'Unknown error',
          }),
          {
            status: 502,
            headers: { 'Content-Type': 'application/json' },
          }
        );
      }
    }

    // Regular HTTP: Use containerFetch
    const clonedRequest = request.clone();
    const proxyRequest = new Request(proxyUrl, {
      method: clonedRequest.method,
      headers: clonedRequest.headers,
      body: clonedRequest.body,
      // @ts-expect-error - duplex required for body streaming in modern runtimes
      duplex: 'half',
    });

    // Add forwarding headers
    proxyRequest.headers.set('X-Original-URL', request.url);
    proxyRequest.headers.set('X-Forwarded-Host', url.hostname);
    proxyRequest.headers.set('X-Forwarded-Proto', url.protocol.replace(':', ''));
    proxyRequest.headers.set('X-App-Id', appId);

    try {
      const response = await sandbox.containerFetch(proxyRequest, port);
      return response;
    } catch (error) {
      logger.error('Container proxy error', formatError(error));
      return new Response(
        JSON.stringify({
          error: 'proxy_error',
          message: error instanceof Error ? error.message : 'Unknown error',
        }),
        {
          status: 502,
          headers: { 'Content-Type': 'application/json' },
        }
      );
    }
  } catch (error) {
    logger.error('Preview proxy error', formatError(error));
    return new Response(
      JSON.stringify({
        error: 'proxy_error',
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      }
    );
  }
}
