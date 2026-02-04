'use client';

import { useLocalStorage } from '@/hooks/useLocalStorage';
import * as React from 'react';

export type AnnouncementConfig = {
  /**
   * Unique identifier for this announcment (allows for tracking in local storage)
   */
  id: string;

  /**
   * ISO Date string for when this announcement should start
   */
  start?: string;

  /**
   * ISO Date string for when this announcement should end
   */
  end?: string;
};

export type UseAnnouncementReturn = {
  isActive: boolean;
  dismiss: () => void;
};

const STORAGE_KEY_PREFIX = 'announcement-dismissed-';

function getStorageKey(id: string): string {
  return `${STORAGE_KEY_PREFIX}${id}`;
}

export function useAnnouncement({ id, start, end }: AnnouncementConfig): UseAnnouncementReturn {
  const [isDismissed, setDismissed] = useLocalStorage(getStorageKey(id), false);
  const dismiss = React.useCallback(() => setDismissed(true), []);
  const now = new Date();

  let isActive = true;

  if (isDismissed) {
    isActive = false;
  } else if (start && now < new Date(start)) {
    isActive = false;
  } else if (end && new Date(end) < now) {
    isActive = false;
  }

  return {
    isActive,
    dismiss,
  };
}
