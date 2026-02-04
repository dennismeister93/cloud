/**
 * Cloud Agent Stream V2 Hook
 *
 * WebSocket-based streaming hook that replaces the SSE-based useCloudAgentStream.
 * Uses:
 * - Event normalizer (src/lib/cloud-agent/event-normalizer.ts) for V2→V1 event mapping
 * - WebSocket manager (src/lib/cloud-agent/websocket-manager.ts) for connection lifecycle
 * - REST API for stream ticket (/api/cloud-agent/sessions/stream-ticket)
 * - tRPC V2 endpoints (initiateFromKilocodeSessionV2, sendMessageV2)
 *
 * Requires cloudAgentSessionId to be provided by the caller (session must be prepared first).
 */

import { useAtomValue, useSetAtom } from 'jotai';
import { useCallback, useRef, useState, useEffect } from 'react';
import { TRPCClientError } from '@trpc/client';
import { z } from 'zod';
import { useRawTRPCClient } from '@/lib/trpc/utils';
import {
  createWebSocketManager,
  type ConnectionState,
  type WebSocketManagerConfig,
} from '@/lib/cloud-agent/websocket-manager';
import {
  tryNormalizeV2Event,
  type V2Event,
  type StreamError,
} from '@/lib/cloud-agent/event-normalizer';
import {
  updateMessageAtom,
  addUserMessageAtom,
  currentSessionIdAtom,
  isStreamingAtom,
  errorAtom,
} from './store/atoms';
import {
  updateHighWaterMarkAtom,
  updateCloudAgentSessionIdAtom,
  getSessionFromStoreAtom,
  processIncomingMessageAtom,
} from './store/db-session-atoms';
import type { CloudMessage, StreamEvent } from './types';
import { CLOUD_AGENT_WS_URL } from '@/lib/constants';

export type { ConnectionState };

export type UseCloudAgentStreamV2Options = {
  /** Cloud-agent session ID (required - returned from prepareSession) */
  cloudAgentSessionId: string;
  /** Organization ID for org-scoped sessions */
  organizationId?: string;
  /** Callback when streaming completes */
  onComplete?: () => void;
  /** Callback when a new kilo session is created (session_created event with CLI session UUID) */
  onKiloSessionCreated?: (kiloSessionId: string) => void;
  /** Callback when session is confirmed initiated (first session_synced event) */
  onSessionInitiated?: () => void;
};

export type UseCloudAgentStreamV2Return = {
  /** Start streaming for a prepared session (alias: initiateFromPreparedSession) */
  startStream: () => Promise<void>;
  /** Alias for startStream - matches V1 interface */
  initiateFromPreparedSession: (cloudAgentSessionId: string) => Promise<void>;
  /** Connect to an existing session's WebSocket stream without initiating execution */
  connectToExistingSession: (cloudAgentSessionId: string) => Promise<void>;
  /** Stop the WebSocket connection */
  stopStream: () => void;
  /** Cleanup function (alias for stopStream) - matches V1 interface */
  cleanup: () => void;
  /** Send a message to an existing session */
  sendMessage: (
    message: string,
    cloudAgentSessionId: string,
    mode: string,
    model: string
  ) => Promise<void>;
  /** Interrupt the current session */
  interruptSession: (cloudAgentSessionId: string) => Promise<void>;
  /** Whether streaming is active */
  isStreaming: boolean;
  /** Current WebSocket connection state */
  connectionState: ConnectionState;
  /** Current error message */
  error: string | null;
};

function isStreamEventType(type: string): type is StreamEvent['streamEventType'] {
  return ['kilocode', 'status', 'output', 'error', 'complete', 'interrupted'].includes(type);
}

export function useCloudAgentStreamV2({
  cloudAgentSessionId: cloudAgentSessionIdProp,
  organizationId,
  onComplete,
  onKiloSessionCreated,
  onSessionInitiated,
}: UseCloudAgentStreamV2Options): UseCloudAgentStreamV2Return {
  const trpcClient = useRawTRPCClient();

  const updateMessage = useSetAtom(updateMessageAtom);
  const addUserMessage = useSetAtom(addUserMessageAtom);
  const setCurrentSessionId = useSetAtom(currentSessionIdAtom);
  const setIsStreaming = useSetAtom(isStreamingAtom);
  const setError = useSetAtom(errorAtom);
  const isStreaming = useAtomValue(isStreamingAtom);

  const updateHighWaterMarkAction = useSetAtom(updateHighWaterMarkAtom);
  const updateCloudAgentSessionIdAction = useSetAtom(updateCloudAgentSessionIdAtom);
  const getSessionFromStore = useSetAtom(getSessionFromStoreAtom);
  const processIncomingMessage = useSetAtom(processIncomingMessageAtom);

  const [connectionState, setConnectionState] = useState<ConnectionState>({
    status: 'disconnected',
  });
  const [localError, setLocalError] = useState<string | null>(null);

  const wsManagerRef = useRef<ReturnType<typeof createWebSocketManager> | null>(null);
  const notifiedKiloSessionIdsRef = useRef<Set<string>>(new Set());
  const sessionInitiatedFiredRef = useRef<Set<string>>(new Set());
  const cloudAgentSessionIdRef = useRef<string | null>(cloudAgentSessionIdProp ?? null);
  const organizationIdRef = useRef<string | undefined>(organizationId);
  // Track in-flight initiation calls to prevent race conditions
  const initiatingSessionsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    cloudAgentSessionIdRef.current = cloudAgentSessionIdProp ?? null;
  }, [cloudAgentSessionIdProp]);

  useEffect(() => {
    organizationIdRef.current = organizationId;
  }, [organizationId]);

  useEffect(() => {
    return () => {
      if (wsManagerRef.current) {
        wsManagerRef.current.disconnect();
        wsManagerRef.current = null;
      }
    };
  }, []);

  const formatStreamError = useCallback((err: unknown): string => {
    if (err instanceof TRPCClientError) {
      const code = err.data?.code || err.shape?.code;
      const httpStatus = err.data?.httpStatus || err.shape?.data?.httpStatus;

      if (code === 'PAYMENT_REQUIRED' || httpStatus === 402) {
        return 'Insufficient credits. Please add at least $1 to continue using Cloud Agent.';
      }
      if (code === 'UNAUTHORIZED' || code === 'FORBIDDEN') {
        return 'You are not authorized to use the Cloud Agent.';
      }
      if (code === 'NOT_FOUND') {
        return 'Cloud Agent service is unavailable right now. Please try again.';
      }
      return 'Cloud Agent encountered an error. Please retry in a moment.';
    }
    if (err instanceof Error) {
      if (err.message.includes('ECONNREFUSED') || err.message.includes('fetch failed')) {
        return 'Lost connection to Cloud Agent. Please retry in a moment.';
      }
      return 'Cloud Agent connection failed. Please retry in a moment.';
    }
    return 'Cloud Agent error. Please retry in a moment.';
  }, []);

  const formatWsError = useCallback((error: StreamError): string => {
    switch (error.code) {
      case 'WS_SESSION_NOT_FOUND':
        return 'Session not found. The session may have been deleted.';
      case 'WS_EXECUTION_NOT_FOUND':
        return 'Execution not found. The execution may have completed or been deleted.';
      case 'WS_AUTH_ERROR':
        return 'Authentication failed. Please sign in again.';
      case 'WS_PROTOCOL_ERROR':
        return 'Received invalid message from server.';
      case 'WS_DUPLICATE_CONNECTION':
        return 'Another connection is already streaming this execution.';
      case 'WS_INTERNAL_ERROR':
      default:
        return error.message || 'An unexpected error occurred.';
    }
  }, []);

  const updateHighWaterMark = useCallback(
    async (sessionId: string, timestamp: number) => {
      if (typeof window === 'undefined') return;
      await updateHighWaterMarkAction({ sessionId, timestamp });
    },
    [updateHighWaterMarkAction]
  );

  const handleSessionCreated = useCallback(
    async (kiloSessionIdFromEvent: string, cloudAgentSessionIdFromEvent: string) => {
      if (typeof window === 'undefined') return;

      const existingSession = getSessionFromStore(kiloSessionIdFromEvent);
      if (existingSession) {
        await updateCloudAgentSessionIdAction({
          sessionId: kiloSessionIdFromEvent,
          cloudAgentSessionId: cloudAgentSessionIdFromEvent,
        });
      }

      // Notify parent component about the new kilo session ID (for URL update)
      if (onKiloSessionCreated && !notifiedKiloSessionIdsRef.current.has(kiloSessionIdFromEvent)) {
        notifiedKiloSessionIdsRef.current.add(kiloSessionIdFromEvent);
        onKiloSessionCreated(kiloSessionIdFromEvent);
      }
    },
    [getSessionFromStore, updateCloudAgentSessionIdAction, onKiloSessionCreated]
  );

  const processEvent = useCallback(
    (event: StreamEvent) => {
      switch (event.streamEventType) {
        case 'kilocode': {
          const payload = event.payload;

          if (payload.event === 'session_created' && typeof payload.sessionId === 'string') {
            const kiloSessionIdFromEvent = payload.sessionId;
            const cloudAgentSessionIdFromEvent =
              event.sessionId || (payload.cloudAgentSessionId as string);

            if (kiloSessionIdFromEvent && cloudAgentSessionIdFromEvent) {
              void handleSessionCreated(kiloSessionIdFromEvent, cloudAgentSessionIdFromEvent);
            }
            break;
          }

          if (payload.event === 'session_synced' && typeof payload.updatedAt === 'number') {
            const targetSessionId = payload.sessionId as string | undefined;

            if (targetSessionId) {
              void updateHighWaterMark(targetSessionId, payload.updatedAt);

              // First session_synced for this session confirms it has been initiated
              if (onSessionInitiated && !sessionInitiatedFiredRef.current.has(targetSessionId)) {
                sessionInitiatedFiredRef.current.add(targetSessionId);
                onSessionInitiated();
              }
            }
            break;
          }

          const message: CloudMessage = {
            ts: (payload.timestamp as number) || Date.now(),
            type: payload.type === 'say' ? 'assistant' : 'system',
            say: payload.say as string,
            ask: payload.ask as string,
            text: (payload.content || payload.text) as string,
            content: (payload.content || payload.text) as string,
            partial: payload.partial as boolean,
            metadata: payload.metadata as Record<string, unknown>,
          };

          updateMessage(message);
          void processIncomingMessage(message);
          break;
        }

        case 'status': {
          if (event.sessionId) {
            setCurrentSessionId(event.sessionId);
          }

          updateMessage({
            ts: Date.now(),
            type: 'system',
            text: event.message,
            partial: false,
          });
          break;
        }

        case 'output': {
          break;
        }

        case 'error': {
          setError(event.error);
          setLocalError(event.error);
          break;
        }

        case 'complete': {
          setIsStreaming(false);
          onComplete?.();
          if (event.sessionId) {
            setCurrentSessionId(event.sessionId);
          }
          break;
        }

        case 'interrupted': {
          setIsStreaming(false);
          if (event.sessionId) {
            setCurrentSessionId(event.sessionId);
          }
          updateMessage({
            ts: Date.now(),
            type: 'system',
            text: event.reason || 'Execution interrupted',
            partial: false,
          });
          break;
        }
      }
    },
    [
      updateMessage,
      setError,
      setIsStreaming,
      setCurrentSessionId,
      onComplete,
      onSessionInitiated,
      processIncomingMessage,
      updateHighWaterMark,
      handleSessionCreated,
    ]
  );

  const handleV2Event = useCallback(
    (v2Event: V2Event) => {
      const v1Event = tryNormalizeV2Event(v2Event);
      if (!v1Event) {
        return;
      }

      if (!isStreamEventType(v1Event.streamEventType)) {
        return;
      }

      const payload = (v1Event.payload ?? {}) as Record<string, unknown>;

      switch (v1Event.streamEventType) {
        case 'kilocode':
          processEvent({
            streamEventType: 'kilocode',
            payload,
            sessionId: v1Event.sessionId,
          });
          break;
        case 'status':
          processEvent({
            streamEventType: 'status',
            message: (payload.message as string) ?? '',
            timestamp: (payload.timestamp as string) ?? new Date().toISOString(),
            sessionId: v1Event.sessionId,
          });
          break;
        case 'output':
          processEvent({
            streamEventType: 'output',
            content: (payload.content as string) ?? '',
            source: (payload.source as 'stdout' | 'stderr') ?? 'stdout',
            timestamp: (payload.timestamp as string) ?? new Date().toISOString(),
            sessionId: v1Event.sessionId,
          });
          break;
        case 'error':
          processEvent({
            streamEventType: 'error',
            error: (payload.error as string) ?? 'Unknown error',
            details: payload.details,
            timestamp: (payload.timestamp as string) ?? new Date().toISOString(),
            sessionId: v1Event.sessionId,
          });
          break;
        case 'complete':
          processEvent({
            streamEventType: 'complete',
            sessionId: v1Event.sessionId ?? '',
            exitCode: (payload.exitCode as number) ?? 0,
            metadata: (payload.metadata as {
              executionTimeMs: number;
              workspace: string;
              userId: string;
              startedAt: string;
              completedAt: string;
            }) ?? {
              executionTimeMs: 0,
              workspace: '',
              userId: '',
              startedAt: '',
              completedAt: '',
            },
          });
          break;
        case 'interrupted':
          processEvent({
            streamEventType: 'interrupted',
            reason: (payload.reason as string) ?? 'Unknown reason',
            timestamp: (payload.timestamp as string) ?? new Date().toISOString(),
            sessionId: v1Event.sessionId,
          });
          break;
      }
    },
    [processEvent]
  );

  const handleWsError = useCallback(
    (error: StreamError) => {
      const errorMessage = formatWsError(error);
      setError(errorMessage);
      setLocalError(errorMessage);

      // Stop streaming for terminal errors
      if (
        error.code === 'WS_SESSION_NOT_FOUND' ||
        error.code === 'WS_EXECUTION_NOT_FOUND' ||
        error.code === 'WS_AUTH_ERROR'
      ) {
        setIsStreaming(false);
      }
    },
    [formatWsError, setError, setIsStreaming]
  );

  const streamTicketResponseSchema = z.object({
    ticket: z.string(),
    expiresAt: z.number().optional(),
  });

  const streamTicketErrorSchema = z.object({
    error: z.string().optional(),
  });

  /**
   * Get a stream ticket for WebSocket authentication.
   * Uses the REST API endpoint instead of tRPC for consistency with prepareSession.
   * Supports organization context.
   */
  const getTicket = useCallback(
    async (targetCloudAgentSessionId: string): Promise<{ ticket: string; expiresAt?: number }> => {
      const body: { cloudAgentSessionId: string; organizationId?: string } = {
        cloudAgentSessionId: targetCloudAgentSessionId,
      };
      if (organizationIdRef.current) {
        body.organizationId = organizationIdRef.current;
      }

      const response = await fetch('/api/cloud-agent/sessions/stream-ticket', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!response.ok) {
        const errorData = streamTicketErrorSchema.parse(await response.json());
        throw new Error(errorData.error || 'Failed to get stream ticket');
      }
      const result = streamTicketResponseSchema.parse(await response.json());
      return result;
    },
    []
  );

  /**
   * Build WebSocket URL for connecting to the stream.
   * Always uses NEXT_PUBLIC_CLOUD_AGENT_WS_URL with cloudAgentSessionId query param.
   */
  const buildWsUrl = useCallback((targetCloudAgentSessionId: string): string => {
    if (!CLOUD_AGENT_WS_URL) {
      throw new Error('NEXT_PUBLIC_CLOUD_AGENT_WS_URL is not configured');
    }
    const url = new URL('/stream', CLOUD_AGENT_WS_URL);
    url.searchParams.set('cloudAgentSessionId', targetCloudAgentSessionId);
    return url.toString();
  }, []);

  const connectWebSocket = useCallback(
    async (targetCloudAgentSessionId: string) => {
      if (wsManagerRef.current) {
        wsManagerRef.current.disconnect();
        wsManagerRef.current = null;
      }

      const { ticket, expiresAt } = await getTicket(targetCloudAgentSessionId);
      const url = buildWsUrl(targetCloudAgentSessionId);

      const config: WebSocketManagerConfig = {
        url,
        ticket,
        ticketExpiresAt: expiresAt,
        onEvent: handleV2Event,
        onError: handleWsError,
        onStateChange: state => {
          setConnectionState(state);

          if (state.status === 'error') {
            setLocalError(state.error);
            setError(state.error);
            if (!state.retryable) {
              setIsStreaming(false);
            }
          }
        },
        // Provide ticket refresh callback for 401 handling
        onRefreshTicket: async () => {
          console.log('[useCloudAgentStreamV2] Refreshing stream ticket...');
          return getTicket(targetCloudAgentSessionId);
        },
      };

      wsManagerRef.current = createWebSocketManager(config);
      wsManagerRef.current.connect();
    },
    [getTicket, buildWsUrl, handleV2Event, handleWsError, setError, setIsStreaming]
  );

  /**
   * Start streaming for a prepared session.
   * Includes guard against duplicate calls for the same session (race condition prevention).
   */
  const startStream = useCallback(async () => {
    const sessionIdToUse = cloudAgentSessionIdRef.current;

    if (!sessionIdToUse) {
      const errorMessage = 'No cloudAgentSessionId available. Session must be prepared first.';
      setLocalError(errorMessage);
      setError(errorMessage);
      return;
    }

    // Guard against duplicate initiation calls for the same session
    // This can happen when prepareSession triggers auto-initiate via atom update
    // while the caller also calls initiateFromPreparedSession
    if (initiatingSessionsRef.current.has(sessionIdToUse)) {
      console.log('[useCloudAgentStreamV2] Skipping duplicate initiation for session', {
        sessionIdToUse,
      });
      return;
    }

    initiatingSessionsRef.current.add(sessionIdToUse);

    setLocalError(null);
    setError(null);
    setIsStreaming(true);

    try {
      let result: { cloudAgentSessionId: string };

      if (organizationIdRef.current) {
        result = await trpcClient.organizations.cloudAgent.initiateFromKilocodeSessionV2.mutate(
          {
            cloudAgentSessionId: sessionIdToUse,
            organizationId: organizationIdRef.current,
          },
          { context: { skipBatch: true } }
        );
      } else {
        result = await trpcClient.cloudAgent.initiateFromKilocodeSessionV2.mutate(
          {
            cloudAgentSessionId: sessionIdToUse,
          },
          { context: { skipBatch: true } }
        );
      }

      cloudAgentSessionIdRef.current = result.cloudAgentSessionId;
      setCurrentSessionId(result.cloudAgentSessionId);
      await connectWebSocket(result.cloudAgentSessionId);
    } catch (err) {
      const errorMessage = formatStreamError(err);
      setLocalError(errorMessage);
      setError(errorMessage);
      setIsStreaming(false);
    } finally {
      // Allow re-initiation after completion (e.g., for retry scenarios)
      // but keep the guard active during the async operation
      initiatingSessionsRef.current.delete(sessionIdToUse);
    }
  }, [
    trpcClient,
    connectWebSocket,
    formatStreamError,
    setError,
    setIsStreaming,
    setCurrentSessionId,
  ]);

  /**
   * Initiate a prepared session - matches V1 interface.
   * This is an alias for startStream that accepts a cloudAgentSessionId parameter.
   */
  const initiateFromPreparedSession = useCallback(
    async (cloudAgentSessionId: string) => {
      cloudAgentSessionIdRef.current = cloudAgentSessionId;
      await startStream();
    },
    [startStream]
  );

  /**
   * Connect to an existing session's WebSocket stream without initiating execution.
   * Use this when loading a previously started session to receive ongoing events.
   */
  const connectToExistingSession = useCallback(
    async (cloudAgentSessionId: string) => {
      cloudAgentSessionIdRef.current = cloudAgentSessionId;
      setCurrentSessionId(cloudAgentSessionId);
      await connectWebSocket(cloudAgentSessionId);
    },
    [connectWebSocket, setCurrentSessionId]
  );

  const stopStream = useCallback(() => {
    if (wsManagerRef.current) {
      wsManagerRef.current.disconnect();
      wsManagerRef.current = null;
    }
    setIsStreaming(false);
    setConnectionState({ status: 'disconnected' });
  }, [setIsStreaming]);

  /**
   * Cleanup function - alias for stopStream to match V1 interface.
   */
  const cleanup = useCallback(() => {
    stopStream();
  }, [stopStream]);

  /**
   * Interrupt the current session.
   * Calls the appropriate tRPC endpoint based on organization context.
   */
  const interruptSession = useCallback(
    async (cloudAgentSessionId: string) => {
      try {
        if (organizationIdRef.current) {
          await trpcClient.organizations.cloudAgent.interruptSession.mutate(
            {
              organizationId: organizationIdRef.current,
              sessionId: cloudAgentSessionId,
            },
            { context: { skipBatch: true } }
          );
        } else {
          await trpcClient.cloudAgent.interruptSession.mutate(
            {
              sessionId: cloudAgentSessionId,
            },
            { context: { skipBatch: true } }
          );
        }

        // Clean up WebSocket connection
        stopStream();

        // Update UI state
        updateMessage({
          ts: Date.now(),
          type: 'system',
          text: 'Execution interrupted by user',
          partial: false,
        });
      } catch (error) {
        console.error('Failed to interrupt session:', error);
        setError('Failed to stop execution');
      }
    },
    [trpcClient, stopStream, updateMessage, setError]
  );

  /**
   * Send a message to an existing session.
   * Caller must provide cloudAgentSessionId, mode and model explicitly.
   * Uses organization-scoped endpoint when organizationId is set.
   */
  const sendMessage = useCallback(
    async (message: string, cloudAgentSessionId: string, mode: string, model: string) => {
      setLocalError(null);
      setError(null);
      setIsStreaming(true);
      addUserMessage(message);

      // Use provided cloudAgentSessionId, falling back to ref for backward compatibility
      const activeCloudAgentSessionId = cloudAgentSessionId || cloudAgentSessionIdRef.current;
      if (!activeCloudAgentSessionId) {
        const errorMessage = 'No cloudAgentSessionId available. Call startStream first.';
        setLocalError(errorMessage);
        setError(errorMessage);
        setIsStreaming(false);
        return;
      }

      // Update ref to match the session we're sending to
      cloudAgentSessionIdRef.current = activeCloudAgentSessionId;

      try {
        let result: { cloudAgentSessionId: string };

        if (organizationIdRef.current) {
          result = await trpcClient.organizations.cloudAgent.sendMessageV2.mutate(
            {
              cloudAgentSessionId: activeCloudAgentSessionId,
              prompt: message,
              mode: mode as 'architect' | 'code' | 'ask' | 'debug' | 'orchestrator',
              model,
              organizationId: organizationIdRef.current,
            },
            { context: { skipBatch: true } }
          );
        } else {
          result = await trpcClient.cloudAgent.sendMessageV2.mutate(
            {
              cloudAgentSessionId: activeCloudAgentSessionId,
              prompt: message,
              mode: mode as 'architect' | 'code' | 'ask' | 'debug' | 'orchestrator',
              model,
            },
            { context: { skipBatch: true } }
          );
        }

        cloudAgentSessionIdRef.current = result.cloudAgentSessionId;

        const currentState = wsManagerRef.current?.getState();
        if (!wsManagerRef.current || !currentState || currentState.status === 'disconnected') {
          await connectWebSocket(result.cloudAgentSessionId);
        }
      } catch (err) {
        const errorMessage = formatStreamError(err);
        setLocalError(errorMessage);
        setError(errorMessage);
        setIsStreaming(false);
      }
    },
    [trpcClient, connectWebSocket, formatStreamError, setError, setIsStreaming, addUserMessage]
  );

  return {
    startStream,
    initiateFromPreparedSession,
    connectToExistingSession,
    stopStream,
    cleanup,
    sendMessage,
    interruptSession,
    isStreaming,
    connectionState,
    error: localError,
  };
}
