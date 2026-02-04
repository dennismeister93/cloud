/**
 * WebSocket Streaming Module
 *
 * Low-level WebSocket connection management for App Builder streaming.
 * This module handles only WebSocket lifecycle concerns:
 * - Connection establishment with ticket-based auth
 * - Automatic reconnection with ticket refresh
 * - Processing incoming stream events
 * - Disconnection and cleanup
 *
 * Higher-level concerns (tRPC mutations, user message handling, state management)
 * are handled by streaming.ts which wraps this module.
 */

import {
  createWebSocketManager,
  type ConnectionState,
  type WebSocketManagerConfig,
} from '@/lib/cloud-agent/websocket-manager';
import { type StreamError, type V2Event } from '@/lib/cloud-agent/event-normalizer';
import { CLOUD_AGENT_WS_URL } from '@/lib/constants';
import { stripSystemContext } from '@/lib/app-builder/message-utils';
import type { StreamingConfig, CloudMessage } from './types';
import { updateMessage, addErrorMessage } from './messages';
import { createLogger } from './logging';

type ExecutionStateTracker = {
  hasStartedEvent: boolean;
  hasTerminalEvent: boolean;
  lastEventTimestamp: number | null; // Unix ms
};

function createExecutionStateTracker(): ExecutionStateTracker {
  return {
    hasStartedEvent: false,
    hasTerminalEvent: false,
    lastEventTimestamp: null,
  };
}

const STALE_EXECUTION_TIMEOUT_MS = 30_000; // 30 seconds

/** Event types to discard (noisy/irrelevant extension messages) */
const DISCARDED_EVENTS = new Set(['welcome', 'session_synced']);
const DISCARDED_ASK_TYPES = new Set(['resume_task']);
const DISCARDED_SAY_TYPES = new Set(['checkpoint_saved']);

/**
 * Checks if a V2Event should be discarded before processing.
 */
function shouldDiscardEvent(event: V2Event): boolean {
  const data = event.data as Record<string, unknown> | null;
  if (!data || typeof data !== 'object') return false;

  const eventType = (data.type ?? data.event) as string | undefined;
  if (eventType && DISCARDED_EVENTS.has(eventType)) return true;
  if (data.type === 'ask' && DISCARDED_ASK_TYPES.has(data.ask as string)) return true;
  if (data.type === 'say' && DISCARDED_SAY_TYPES.has(data.say as string)) return true;

  return false;
}

/**
 * Transforms a V2Event into a CloudMessage for the store.
 * Returns null if the event should not produce a message.
 */
function transformV2EventToCloudMessage(event: V2Event): CloudMessage | null {
  const ts = new Date(event.timestamp).getTime();

  switch (event.streamEventType) {
    case 'status': {
      const data = event.data as { message?: string };
      return {
        ts,
        type: 'system',
        text: data.message ?? 'Status update',
        partial: false,
      };
    }

    case 'error': {
      const data = event.data as { message?: string };
      return {
        ts,
        type: 'system',
        say: 'error',
        text: data.message ?? 'An error occurred',
        partial: false,
      };
    }

    case 'kilocode': {
      const data = event.data as Record<string, unknown>;
      let content = (data.content ?? data.text) as string | undefined;
      const timestamp = (data.timestamp as number) ?? ts;

      // Strip system context prefix from user feedback messages (for legacy messages)
      if (data.say === 'user_feedback' && content) {
        content = stripSystemContext(content, timestamp);
      }

      return {
        ts: timestamp,
        type: data.type === 'say' ? 'assistant' : 'system',
        say: data.say as string | undefined,
        ask: data.ask as string | undefined,
        text: content,
        partial: data.partial as boolean | undefined,
        metadata: data.metadata as Record<string, unknown> | undefined,
      };
    }

    case 'started': {
      // Session started event - just a status message
      return {
        ts,
        type: 'system',
        text: 'Session started',
        partial: false,
      };
    }

    case 'complete': {
      // Session complete event - handled at streaming level
      return null;
    }

    default:
      // Unknown event types are ignored
      return null;
  }
}

/**
 * Configuration for WebSocket streaming coordinator
 */
export type WebSocketStreamingConfig = StreamingConfig & {
  /** Function to fetch stream ticket from API */
  fetchStreamTicket: (
    cloudAgentSessionId: string
  ) => Promise<{ ticket: string; expiresAt: number }>;
};

/**
 * WebSocket streaming coordinator interface.
 * Focused on WebSocket connection lifecycle - message handling is done by the caller.
 */
export type WebSocketStreamingCoordinator = {
  /** Connect to WebSocket stream for a session */
  connectToStream: (cloudAgentSessionId: string, fromId?: number) => Promise<void>;
  /** Interrupt the current stream (disconnects WebSocket) */
  interrupt: () => void;
  /** Destroy the coordinator and clean up resources */
  destroy: () => void;
  /** Get current WebSocket connection state */
  getConnectionState: () => ConnectionState;
};

/**
 * Creates a WebSocket streaming coordinator for managing WebSocket connections.
 *
 * The coordinator handles:
 * - WebSocket connection lifecycle (connect, disconnect)
 * - Automatic reconnection with ticket refresh
 * - Processing incoming V2 stream events
 *
 * Note: This is a low-level module. tRPC mutations and user message handling
 * are managed by streaming.ts which wraps this coordinator.
 */
export function createWebSocketStreamingCoordinator(
  config: WebSocketStreamingConfig
): WebSocketStreamingCoordinator {
  const { projectId, store, onStreamComplete, fetchStreamTicket } = config;

  const logger = createLogger(projectId);

  // Internal state
  let wsManager: ReturnType<typeof createWebSocketManager> | null = null;
  let connectionState: ConnectionState = { status: 'disconnected' };
  let destroyed = false;
  let tracker = createExecutionStateTracker();
  let staleCheckTimeout: ReturnType<typeof setTimeout> | null = null;
  let currentCloudSessionId: string | null = null;

  function clearStaleTimer(): void {
    if (staleCheckTimeout !== null) {
      clearTimeout(staleCheckTimeout);
      staleCheckTimeout = null;
    }
  }

  function checkForStaleExecution(): void {
    if (!tracker.hasStartedEvent || tracker.hasTerminalEvent) {
      return;
    }
    if (tracker.lastEventTimestamp === null) {
      return;
    }
    const now = Date.now();
    const timeSinceLastEvent = now - tracker.lastEventTimestamp;
    if (timeSinceLastEvent > STALE_EXECUTION_TIMEOUT_MS) {
      console.warn('[WebSocketStreaming] Detected stale execution - no events for >30s', {
        lastEventTimestamp: tracker.lastEventTimestamp,
        timeSinceLastEvent,
      });
      store.setState({ isStreaming: false });
    }
  }

  function scheduleStaleCheck(): void {
    clearStaleTimer();
    if (tracker.hasStartedEvent && !tracker.hasTerminalEvent) {
      staleCheckTimeout = setTimeout(checkForStaleExecution, STALE_EXECUTION_TIMEOUT_MS);
    }
  }

  /**
   * Updates the connection state and notifies the store
   */
  function updateConnectionState(state: ConnectionState): void {
    connectionState = state;
    logger.log('WebSocket connection state changed', { status: state.status });

    // Only set isStreaming: false on error/disconnect
    // The 'started' event will set isStreaming: true
    if (state.status === 'error' || state.status === 'disconnected') {
      store.setState({ isStreaming: false });
      clearStaleTimer();
      if (state.status === 'disconnected') {
        onStreamComplete?.();
      }
    }
  }

  /**
   * Handles stream errors from WebSocket
   */
  function handleStreamError(error: StreamError): void {
    logger.logError('WebSocket stream error', new Error(error.message));
    addErrorMessage(store, error.message);

    // Some errors are fatal and should stop streaming
    if (error.code === 'WS_SESSION_NOT_FOUND' || error.code === 'WS_AUTH_ERROR') {
      wsManager?.disconnect();
    }
  }

  /**
   * Checks if the current WebSocket connection can be reused for the given session.
   * A connection is reusable if it's connected/connecting to the same session ID.
   */
  function canReuseConnection(cloudAgentSessionId: string): boolean {
    if (!wsManager || !currentCloudSessionId) {
      return false;
    }

    // Must be the same session ID
    if (currentCloudSessionId !== cloudAgentSessionId) {
      return false;
    }

    // Must be in a usable state
    const status = connectionState.status;
    return status === 'connected' || status === 'connecting' || status === 'reconnecting';
  }

  /**
   * Connects to WebSocket stream for the given session
   *
   * @param cloudAgentSessionId - The cloud agent session ID to connect to
   * @param fromId - Optional event ID to replay from (0 to replay all events)
   */
  async function connectToStream(cloudAgentSessionId: string, fromId?: number): Promise<void> {
    if (destroyed) {
      logger.logWarn('Cannot connect: Streaming coordinator is destroyed');
      return;
    }

    // Check if we can reuse the existing connection
    if (canReuseConnection(cloudAgentSessionId)) {
      logger.log('Reusing existing WebSocket connection for session', { cloudAgentSessionId });
      return;
    }

    // Reset tracker for new connection
    tracker = createExecutionStateTracker();
    clearStaleTimer();

    // Disconnect existing connection if switching sessions
    if (wsManager) {
      wsManager.disconnect();
      wsManager = null;
    }

    // Track the session we're connecting to
    currentCloudSessionId = cloudAgentSessionId;

    try {
      // Fetch initial ticket
      const { ticket, expiresAt } = await fetchStreamTicket(cloudAgentSessionId);

      // Build WebSocket URL with optional fromId for replay
      let wsUrl = `${CLOUD_AGENT_WS_URL}/stream?cloudAgentSessionId=${encodeURIComponent(cloudAgentSessionId)}`;
      if (fromId !== undefined) {
        wsUrl += `&fromId=${fromId}`;
      }

      const wsConfig: WebSocketManagerConfig = {
        url: wsUrl,
        ticket,
        ticketExpiresAt: expiresAt,
        onEvent: (event: V2Event) => {
          // Ignore heartbeat events
          if (event.streamEventType === 'heartbeat') {
            return;
          }

          // Update timestamp tracking
          const eventTime = new Date(event.timestamp).getTime();
          tracker.lastEventTimestamp = eventTime;

          // Track lifecycle events
          if (event.streamEventType === 'started') {
            tracker.hasStartedEvent = true;
            store.setState({ isStreaming: true });
            scheduleStaleCheck();
          } else if (
            event.streamEventType === 'complete' ||
            event.streamEventType === 'interrupted'
          ) {
            tracker.hasTerminalEvent = true;
            store.setState({ isStreaming: false });
            clearStaleTimer();
          } else if (tracker.hasStartedEvent && !tracker.hasTerminalEvent) {
            // Reset stale timer on any event while execution is in progress
            scheduleStaleCheck();
          }

          // Continue with existing discard/transform logic
          if (shouldDiscardEvent(event)) {
            return;
          }
          const message = transformV2EventToCloudMessage(event);
          if (message) {
            updateMessage(store, message);
          }
        },
        onStateChange: updateConnectionState,
        onError: handleStreamError,
        onRefreshTicket: async () => {
          return fetchStreamTicket(cloudAgentSessionId);
        },
      };

      wsManager = createWebSocketManager(wsConfig);
      wsManager.connect();
    } catch (err) {
      logger.logError('Failed to connect to WebSocket stream', err);
      store.setState({ isStreaming: false });
      addErrorMessage(store, err instanceof Error ? err.message : 'Failed to connect to stream');
    }
  }

  /**
   * Interrupts the current stream by disconnecting the WebSocket.
   *
   * Note: This only handles WebSocket cleanup. The actual interrupt API call
   * and isInterrupting state management should be handled by the caller
   * (streaming.ts) using tRPC appBuilder.interruptSession mutation.
   */
  function interrupt(): void {
    if (destroyed) {
      return;
    }

    logger.log('Interrupting WebSocket connection');

    // Disconnect WebSocket and clear session tracking
    if (wsManager) {
      wsManager.disconnect();
      wsManager = null;
    }
    currentCloudSessionId = null;
    clearStaleTimer();

    // Only set isStreaming: false - isInterrupting is managed by the caller
    store.setState({ isStreaming: false });
  }

  /**
   * Destroys the coordinator and cleans up resources.
   */
  function destroy(): void {
    if (destroyed) {
      return;
    }

    destroyed = true;
    clearStaleTimer();
    currentCloudSessionId = null;

    if (wsManager) {
      wsManager.disconnect();
      wsManager = null;
    }
  }

  /**
   * Gets the current WebSocket connection state
   */
  function getConnectionState(): ConnectionState {
    return connectionState;
  }

  return {
    connectToStream,
    interrupt,
    destroy,
    getConnectionState,
  };
}
