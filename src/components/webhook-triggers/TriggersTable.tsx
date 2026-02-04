'use client';

import { memo } from 'react';
import Link from 'next/link';
import { formatDistanceToNow } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Copy, Pencil, Trash2, Check } from 'lucide-react';

export type TriggerItem = {
  id: string;
  triggerId: string;
  githubRepo: string;
  isActive: boolean;
  createdAt: string;
};

type TriggersTableProps = {
  triggers: TriggerItem[];
  onCopyUrl: (triggerId: string) => void;
  onDelete: (triggerId: string, githubRepo: string) => void;
  copiedTriggerId: string | null;
  getEditUrl: (triggerId: string) => string;
};

/**
 * Table component displaying webhook triggers.
 */
export const TriggersTable = memo(function TriggersTable({
  triggers,
  onCopyUrl,
  onDelete,
  copiedTriggerId,
  getEditUrl,
}: TriggersTableProps) {
  return (
    <div className="rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Trigger Name</TableHead>
            <TableHead>GitHub Repo</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Created</TableHead>
            <TableHead className="text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {triggers.map(trigger => (
            <TriggerRow
              key={trigger.id}
              trigger={trigger}
              onCopyUrl={onCopyUrl}
              onDelete={onDelete}
              isCopied={copiedTriggerId === trigger.triggerId}
              editUrl={getEditUrl(trigger.triggerId)}
            />
          ))}
        </TableBody>
      </Table>
    </div>
  );
});

type TriggerRowProps = {
  trigger: TriggerItem;
  onCopyUrl: (triggerId: string) => void;
  onDelete: (triggerId: string, githubRepo: string) => void;
  isCopied: boolean;
  editUrl: string;
};

const TriggerRow = memo(function TriggerRow({
  trigger,
  onCopyUrl,
  onDelete,
  isCopied,
  editUrl,
}: TriggerRowProps) {
  return (
    <TableRow>
      <TableCell>
        <Link href={editUrl} className="font-mono text-sm hover:underline">
          {trigger.triggerId}
        </Link>
      </TableCell>
      <TableCell className="text-muted-foreground font-mono text-sm">
        {trigger.githubRepo}
      </TableCell>
      <TableCell>
        <Badge variant={trigger.isActive ? 'default' : 'secondary'}>
          {trigger.isActive ? 'Active' : 'Inactive'}
        </Badge>
      </TableCell>
      <TableCell className="text-muted-foreground">
        {formatDistanceToNow(new Date(trigger.createdAt), { addSuffix: true })}
      </TableCell>
      <TableCell>
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => onCopyUrl(trigger.triggerId)}
            title="Copy Webhook URL"
          >
            {isCopied ? <Check className="h-4 w-4 text-green-500" /> : <Copy className="h-4 w-4" />}
          </Button>

          <Button variant="ghost" size="icon" asChild title="Edit Trigger">
            <Link href={editUrl}>
              <Pencil className="h-4 w-4" />
            </Link>
          </Button>

          <Button
            variant="ghost"
            size="icon"
            onClick={() => onDelete(trigger.triggerId, trigger.githubRepo)}
            title="Delete Trigger"
          >
            <Trash2 className="text-destructive h-4 w-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
});
