'use client';

import { memo } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Webhook, Plus } from 'lucide-react';

type WebhookTriggersHeaderProps = {
  createUrl: string;
  disabled?: boolean;
};

/**
 * Header component for the webhook triggers list page.
 * Shows title, beta badge, and create button.
 */
export const WebhookTriggersHeader = memo(function WebhookTriggersHeader({
  createUrl,
  disabled,
}: WebhookTriggersHeaderProps) {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Webhook className="h-8 w-8" />
          <h1 className="text-3xl font-bold">Webhook Triggers</h1>
          <Badge variant="new">new</Badge>
        </div>
        <Button asChild disabled={disabled}>
          <Link href={disabled ? '#' : createUrl}>
            <Plus className="mr-2 h-4 w-4" />
            Create Trigger
          </Link>
        </Button>
      </div>
      <p className="text-muted-foreground mt-2">
        Manage webhook triggers that automatically start cloud agent sessions.
      </p>
    </div>
  );
});
