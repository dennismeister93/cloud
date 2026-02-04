/**
 * ProjectSession
 *
 * React component that owns the ProjectManager lifecycle.
 * Creates the ProjectManager on mount, destroys it on unmount,
 * and provides state via React Context for child components.
 *
 * Uses useSyncExternalStore to subscribe to ProjectManager state changes
 * for proper React concurrent mode compatibility.
 */

'use client';

import React, {
  createContext,
  useContext,
  useMemo,
  useEffect,
  useRef,
  useSyncExternalStore,
} from 'react';
import { useRawTRPCClient } from '@/lib/trpc/utils';
import { ProjectManager, type ProjectState } from './ProjectManager';
import type { ProjectWithMessages } from '@/lib/app-builder/types';

// =============================================================================
// Context Types
// =============================================================================

type ProjectContextValue = {
  manager: ProjectManager;
  state: ProjectState;
};

const ProjectContext = createContext<ProjectContextValue | null>(null);

// =============================================================================
// Props Types
// =============================================================================

type ProjectSessionProps = {
  project: ProjectWithMessages;
  organizationId: string | null;
  children: React.ReactNode;
};

// =============================================================================
// Component
// =============================================================================

export function ProjectSession({ project, organizationId, children }: ProjectSessionProps) {
  const trpcClient = useRawTRPCClient();

  // Use a ref to hold the manager and a state counter to force re-renders.
  // The counter is incremented when we need to create a new manager.
  const managerRef = useRef<ProjectManager | null>(null);
  const [managerVersion, setManagerVersion] = React.useState(0);

  // Create manager if needed (null or destroyed)
  // This check runs on every render, including after Strict Mode triggers a state update
  if (managerRef.current === null || managerRef.current.destroyed) {
    managerRef.current = new ProjectManager({
      project,
      trpcClient,
      organizationId,
    });
  }

  const manager = managerRef.current;

  // Effect to handle Strict Mode: when manager is destroyed, trigger a re-render
  // to create a new manager. Also handles normal cleanup on unmount.
  useEffect(() => {
    // If the manager is already destroyed when this effect runs,
    // we need to force a re-render to create a new one.
    // This happens in Strict Mode's second mount after cleanup.
    if (manager.destroyed) {
      setManagerVersion(v => v + 1);
      return;
    }

    return () => {
      manager.destroy();
      // After destroying, the next effect run will see destroyed=true
      // and trigger a re-render via setManagerVersion
    };
  }, [manager, managerVersion]);

  // Subscribe to state changes using useSyncExternalStore
  const state = useSyncExternalStore(manager.subscribe, manager.getState, manager.getState);

  // Memoize context value to prevent unnecessary re-renders
  const contextValue = useMemo<ProjectContextValue>(
    () => ({
      manager,
      state,
    }),
    [manager, state]
  );

  return <ProjectContext value={contextValue}>{children}</ProjectContext>;
}

// =============================================================================
// Hooks
// =============================================================================

/**
 * Hook to access the ProjectManager instance.
 * Use this for calling methods like sendMessage(), interrupt(), deploy().
 *
 * @throws Error if used outside of ProjectSession
 */
export function useProjectManager(): ProjectManager {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProjectManager must be used within a ProjectSession');
  }
  return context.manager;
}

/**
 * Hook to access the current ProjectState.
 * Use this for reading state like messages, isStreaming, previewUrl, etc.
 *
 * The state is automatically kept in sync with the ProjectManager
 * via useSyncExternalStore.
 *
 * @throws Error if used outside of ProjectSession
 */
export function useProjectState(): ProjectState {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProjectState must be used within a ProjectSession');
  }
  return context.state;
}

/**
 * Hook to access both the ProjectManager and current state.
 * Convenience hook when you need both.
 *
 * @throws Error if used outside of ProjectSession
 */
export function useProject(): ProjectContextValue {
  const context = useContext(ProjectContext);
  if (!context) {
    throw new Error('useProject must be used within a ProjectSession');
  }
  return context;
}
