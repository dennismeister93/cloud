'use client';

import { useEffect, useState, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Terminal, CheckCircle2, XCircle } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useTRPC } from '@/lib/trpc/utils';
import type { ReviewEvent } from '@/lib/code-reviews/client/code-review-worker-client';

type CodeReviewStreamViewProps = {
  sessionId: string;
  reviewId: string;
  onComplete?: () => void;
};

const formatTimestamp = (timestamp: string): string => {
  const date = new Date(timestamp);
  return date.toLocaleTimeString('en-US', {
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
};

export function CodeReviewStreamView({ reviewId, onComplete }: CodeReviewStreamViewProps) {
  const trpc = useTRPC();
  const [isComplete, setIsComplete] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Poll for events via tRPC (secure, server-side auth)
  const { data, isLoading, error } = useQuery({
    ...trpc.codeReviews.getReviewEvents.queryOptions({ reviewId }),
    refetchInterval: isComplete ? false : 2000, // Poll every 2 seconds until complete
    enabled: !!reviewId,
  });

  const events = data?.success ? data.events : [];

  // Auto-scroll to bottom when new events arrive
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events, autoScroll]);

  // Check if complete
  useEffect(() => {
    if (events.length === 0) return;

    const lastEvent = events[events.length - 1];
    if (lastEvent?.eventType === 'complete') {
      setIsComplete(true);
      onComplete?.();
    }
  }, [events, onComplete]);

  if (isLoading && events.length === 0) {
    return (
      <Card className="border-l-4 border-l-blue-500">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading events...
          </CardTitle>
        </CardHeader>
      </Card>
    );
  }

  if (error) {
    return (
      <Card className="border-l-4 border-l-red-500">
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <XCircle className="h-4 w-4 text-red-500" />
            <CardTitle className="text-sm font-medium text-red-500">
              Failed to load events
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="rounded-md bg-slate-950 p-4 font-mono text-xs text-red-400">
            {error instanceof Error ? error.message : 'Unknown error'}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-l-4 border-l-blue-500">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4" />
            <CardTitle className="text-sm font-medium">Code Review Progress</CardTitle>
          </div>
          {isComplete ? (
            <Badge variant="default" className="gap-1.5 bg-emerald-500 hover:bg-emerald-600">
              <CheckCircle2 className="h-3 w-3" />
              Complete
            </Badge>
          ) : (
            <Badge variant="secondary" className="gap-1.5">
              <Loader2 className="h-3 w-3 animate-spin" />
              Running
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div
          ref={scrollRef}
          className="max-h-[500px] overflow-y-auto rounded-md bg-slate-950 p-4 font-mono text-xs dark:bg-slate-950"
          onScroll={e => {
            const element = e.currentTarget;
            const isAtBottom =
              Math.abs(element.scrollHeight - element.scrollTop - element.clientHeight) < 1;
            setAutoScroll(isAtBottom);
          }}
        >
          {events.length === 0 ? (
            <div className="flex items-center gap-2 text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />
              <span>Waiting for events...</span>
            </div>
          ) : (
            <div className="space-y-1">
              {events.map((event: ReviewEvent, index: number) => (
                <div
                  key={index}
                  className="rounded px-2 py-1 transition-colors hover:bg-slate-900/50"
                >
                  <div className="flex gap-3 text-slate-300">
                    <span className="shrink-0 text-slate-500 select-none">
                      {formatTimestamp(event.timestamp)}
                    </span>
                    <span className="break-all">{event.message || 'Event received'}</span>
                  </div>
                  {event.content && (
                    <div className="mt-1 ml-[72px] font-mono text-[11px] break-all whitespace-pre-wrap text-slate-400">
                      {event.content}
                    </div>
                  )}
                </div>
              ))}
              {!isComplete && (
                <div className="flex items-center gap-2 px-2 py-1 text-slate-500">
                  <div className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
                  <span>Live</span>
                </div>
              )}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
