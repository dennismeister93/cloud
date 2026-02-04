'use client';

import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle2, XCircle, Brain } from 'lucide-react';

type AnalysisStatusBadgeProps = {
  status: string | null | undefined;
  /** Show as "starting" state when analysis button was just clicked but status hasn't updated yet */
  isStarting?: boolean;
};

export function AnalysisStatusBadge({ status, isStarting }: AnalysisStatusBadgeProps) {
  // Show "Analyzing..." immediately when starting, before backend status updates
  if (isStarting && !status) {
    return (
      <Badge variant="outline" className="border-yellow-500/30 bg-yellow-500/20 text-yellow-400">
        <Loader2 className="mr-1 h-3 w-3 animate-spin" />
        Analyzing...
      </Badge>
    );
  }

  if (!status) {
    return (
      <Badge variant="outline" className="border-gray-500/30 bg-gray-500/20 text-gray-400">
        <Brain className="mr-1 h-3 w-3" />
        Not Analyzed
      </Badge>
    );
  }

  switch (status) {
    case 'pending':
      return (
        <Badge variant="outline" className="border-yellow-500/30 bg-yellow-500/20 text-yellow-400">
          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          Analyzing...
        </Badge>
      );
    case 'running':
      return (
        <Badge variant="outline" className="border-yellow-500/30 bg-yellow-500/20 text-yellow-400">
          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
          Analyzing...
        </Badge>
      );
    case 'completed':
      return (
        <Badge variant="outline" className="border-green-500/30 bg-green-500/20 text-green-400">
          <CheckCircle2 className="mr-1 h-3 w-3" />
          Analyzed
        </Badge>
      );
    case 'failed':
      return (
        <Badge variant="outline" className="border-red-500/30 bg-red-500/20 text-red-400">
          <XCircle className="mr-1 h-3 w-3" />
          Failed
        </Badge>
      );
    default:
      return null;
  }
}
