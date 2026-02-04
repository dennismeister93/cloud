'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDate } from '@/lib/admin-utils';

type ErrorData = {
  errorType: string;
  count: number;
  firstOccurrence: string;
  lastOccurrence: string;
};

export function CodeReviewErrorAnalysis({ data }: { data: ErrorData[] }) {
  const totalErrors = data.reduce((sum, error) => sum + error.count, 0);

  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Error Analysis</CardTitle>
          <CardDescription>No errors in selected period</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            No failed reviews found in this time range.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Error Analysis</CardTitle>
        <CardDescription>
          {data.length} unique error types, {totalErrors.toLocaleString()} total failures
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="max-h-[400px] overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50%]">Error Type</TableHead>
                <TableHead className="text-right">Count</TableHead>
                <TableHead className="text-right">% of Errors</TableHead>
                <TableHead>First Seen</TableHead>
                <TableHead>Last Seen</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((error, idx) => (
                <TableRow key={idx}>
                  <TableCell
                    className="max-w-[400px] truncate font-mono text-xs"
                    title={error.errorType}
                  >
                    {error.errorType}
                  </TableCell>
                  <TableCell className="text-right font-medium">{error.count}</TableCell>
                  <TableCell className="text-muted-foreground text-right">
                    {((error.count / totalErrors) * 100).toFixed(1)}%
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {formatDate(error.firstOccurrence)}
                  </TableCell>
                  <TableCell className="text-muted-foreground text-xs">
                    {formatDate(error.lastOccurrence)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
