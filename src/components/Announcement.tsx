'use client';

import {
  useAnnouncement,
  type AnnouncementConfig,
  type UseAnnouncementReturn,
} from '@/hooks/useAnnouncement';

type AnnouncementProps = AnnouncementConfig & {
  children: (props: UseAnnouncementReturn) => React.ReactNode;
};

export function Announcement({ id, start, end, children }: AnnouncementProps) {
  const { isActive, dismiss } = useAnnouncement({ id, start, end });

  if (!isActive) {
    return null;
  }

  return <>{children({ isActive, dismiss })}</>;
}
