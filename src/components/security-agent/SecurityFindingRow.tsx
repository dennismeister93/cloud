'use client';

import { Button } from '@/components/ui/button';
import { SeverityBadge } from './SeverityBadge';
import { AnalysisStatusBadge } from './AnalysisStatusBadge';
import { FindingStatusBadge } from './FindingStatusBadge';
import { ExploitabilityBadge } from './ExploitabilityBadge';
import { cn } from '@/lib/utils';
import { formatDistanceToNow, isPast } from 'date-fns';
import { ExternalLink, Package, Clock, CheckCircle2, Brain, Loader2 } from 'lucide-react';
import type { SecurityFinding } from '@/db/schema';

type Severity = 'critical' | 'high' | 'medium' | 'low';

function isSeverity(value: string): value is Severity {
  return ['critical', 'high', 'medium', 'low'].includes(value);
}

type SecurityFindingRowProps = {
  finding: SecurityFinding;
  onClick: () => void;
  onStartAnalysis?: (findingId: string) => void;
  isStartingAnalysis?: boolean;
};

function getSlaStatus(slaDueAt: string | null, status: string) {
  if (status !== 'open' || !slaDueAt) return null;

  const dueDate = new Date(slaDueAt);
  const isOverdue = isPast(dueDate);

  if (isOverdue) {
    return (
      <span className="flex items-center gap-1 text-xs text-red-400">
        <Clock className="h-3 w-3" />
        {formatDistanceToNow(dueDate)} overdue
      </span>
    );
  }

  return (
    <span className="text-muted-foreground flex items-center gap-1 text-xs">
      <Clock className="h-3 w-3" />
      Due in {formatDistanceToNow(dueDate)}
    </span>
  );
}

export function SecurityFindingRow({
  finding,
  onClick,
  onStartAnalysis,
  isStartingAnalysis,
}: SecurityFindingRowProps) {
  const severity: Severity = isSeverity(finding.severity) ? finding.severity : 'medium';
  const hasAnalysis = !!finding.analysis_status;
  const canStartAnalysis =
    finding.status === 'open' && !hasAnalysis && onStartAnalysis && !isStartingAnalysis;

  const handleStartAnalysis = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (onStartAnalysis) {
      onStartAnalysis(finding.id);
    }
  };

  return (
    <div
      onClick={onClick}
      className={cn(
        'hover:bg-muted/50 cursor-pointer rounded-lg border p-4 transition-colors',
        finding.status === 'open' && finding.sla_due_at && isPast(new Date(finding.sla_due_at))
          ? 'border-red-500/30'
          : ''
      )}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <h4 className="truncate font-medium">{finding.title}</h4>
            <SeverityBadge severity={severity} size="sm" />
          </div>

          <div className="text-muted-foreground flex flex-wrap items-center gap-2 text-sm">
            <span className="flex items-center gap-1">
              <Package className="h-3 w-3" />
              {finding.package_name}
            </span>
            <span>•</span>
            <span>{finding.package_ecosystem}</span>
            <span>•</span>
            <span>{finding.repo_full_name}</span>
            {finding.cve_id && (
              <>
                <span>•</span>
                <span className="font-mono text-xs">{finding.cve_id}</span>
              </>
            )}
            {!finding.cve_id && finding.ghsa_id && (
              <>
                <span>•</span>
                <span className="font-mono text-xs">{finding.ghsa_id}</span>
              </>
            )}
          </div>

          <div className="flex items-center gap-3">
            {getSlaStatus(finding.sla_due_at, finding.status)}
            {finding.status === 'fixed' && finding.fixed_at && (
              <span className="flex items-center gap-1 text-xs text-green-400">
                <CheckCircle2 className="h-3 w-3" />
                Fixed {formatDistanceToNow(new Date(finding.fixed_at), { addSuffix: true })}
              </span>
            )}
            <AnalysisStatusBadge status={finding.analysis_status} isStarting={isStartingAnalysis} />
            <ExploitabilityBadge analysis={finding.analysis} size="sm" />
          </div>
        </div>

        <div className="flex flex-col items-end gap-2">
          <FindingStatusBadge status={finding.status} />
          {canStartAnalysis && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleStartAnalysis}
              disabled={isStartingAnalysis}
              className="gap-1"
            >
              {isStartingAnalysis ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Brain className="h-3 w-3" />
              )}
              Analyze
            </Button>
          )}
          {finding.dependabot_html_url && (
            <a
              href={finding.dependabot_html_url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={e => e.stopPropagation()}
              className="text-muted-foreground hover:text-foreground flex items-center gap-1 text-xs transition-colors"
            >
              <ExternalLink className="h-3 w-3" />
              View on GitHub
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
