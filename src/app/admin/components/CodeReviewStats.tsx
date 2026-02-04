'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type StatsData = {
  totalReviews: number;
  completedCount: number;
  failedCount: number;
  cancelledCount: number;
  interruptedCount: number;
  inProgressCount: number;
  successRate: number;
  failureRate: number;
  avgDurationSeconds: number;
};

export function CodeReviewStats({ data }: { data: StatsData }) {
  const formatDuration = (seconds: number) => {
    if (seconds === 0) return '-';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    if (seconds < 3600) return `${Math.round(seconds / 60)}m`;
    return `${(seconds / 3600).toFixed(1)}h`;
  };

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Total Reviews</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">{data.totalReviews.toLocaleString()}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Success Rate</CardTitle>
          <CardDescription>{data.completedCount.toLocaleString()} completed</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-green-600">{data.successRate.toFixed(1)}%</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Failure Rate</CardTitle>
          <CardDescription>
            {data.failedCount.toLocaleString()} failed, {data.interruptedCount.toLocaleString()}{' '}
            interrupted
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-red-600">{data.failureRate.toFixed(1)}%</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Avg Duration</CardTitle>
          <CardDescription>Completed reviews</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold">{formatDuration(data.avgDurationSeconds)}</div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">In Progress</CardTitle>
          <CardDescription>Pending/Queued/Running</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="text-3xl font-bold text-blue-600">{data.inProgressCount}</div>
        </CardContent>
      </Card>
    </div>
  );
}
