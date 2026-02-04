/**
 * Internal API Endpoint: Add Label to Issue
 *
 * Called by:
 * - Triage Orchestrator (to add kilo-auto-fix label when confidence threshold is met)
 *
 * Process:
 * 1. Get ticket and integration
 * 2. Add label to GitHub issue
 * 3. Update triage ticket with should_auto_fix = true
 *
 * URL: POST /api/internal/triage/add-label
 * Protected by internal API secret
 */

import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { getTriageTicketById, updateTriageTicketStatus } from '@/lib/auto-triage/db/triage-tickets';
import { logExceptInTest, errorExceptInTest } from '@/lib/utils.server';
import { captureException } from '@sentry/nextjs';
import { INTERNAL_API_SECRET } from '@/lib/config.server';
import { addIssueLabel } from '@/lib/auto-triage/github/add-label';
import { generateGitHubInstallationToken } from '@/lib/integrations/platforms/github/adapter';
import { getIntegrationById } from '@/lib/integrations/db/platform-integrations';

interface AddLabelRequest {
  ticketId: string;
  label: string;
  classification?: 'bug' | 'feature' | 'question' | 'unclear';
  confidence?: number;
  intentSummary?: string;
  relatedFiles?: string[];
}

export async function POST(req: NextRequest) {
  try {
    // Validate internal API secret
    const secret = req.headers.get('X-Internal-Secret');
    if (secret !== INTERNAL_API_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body: AddLabelRequest = await req.json();
    const { ticketId, label, classification, confidence, intentSummary, relatedFiles } = body;

    // Validate payload
    if (!ticketId || !label) {
      return NextResponse.json(
        { error: 'Missing required fields: ticketId, label' },
        { status: 400 }
      );
    }

    logExceptInTest('[add-label] Adding label to issue', { ticketId, label });

    // Get ticket from database
    const ticket = await getTriageTicketById(ticketId);

    if (!ticket) {
      logExceptInTest('[add-label] Ticket not found', { ticketId });
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    // Get GitHub token from integration
    if (!ticket.platform_integration_id) {
      return NextResponse.json({ error: 'No platform integration found' }, { status: 400 });
    }

    const integration = await getIntegrationById(ticket.platform_integration_id);

    if (!integration?.platform_installation_id) {
      return NextResponse.json({ error: 'No platform installation found' }, { status: 400 });
    }

    const tokenData = await generateGitHubInstallationToken(integration.platform_installation_id);

    // Add label to GitHub issue
    await addIssueLabel({
      repoFullName: ticket.repo_full_name,
      issueNumber: ticket.issue_number,
      label,
      githubToken: tokenData.token,
    });

    logExceptInTest('[add-label] Label added to GitHub issue', {
      ticketId,
      label,
      issueNumber: ticket.issue_number,
    });

    // Update triage ticket with classification data
    await updateTriageTicketStatus(ticketId, 'actioned', {
      classification,
      confidence,
      intentSummary,
      relatedFiles,
      actionTaken: 'comment_posted', // Label addition is a form of action
      completedAt: new Date(),
    });

    logExceptInTest('[add-label] Updated triage ticket', {
      ticketId,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    errorExceptInTest('[add-label] Error adding label:', error);
    captureException(error, {
      tags: { source: 'add-label-api' },
    });

    return NextResponse.json(
      {
        error: 'Failed to add label',
        message: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}
