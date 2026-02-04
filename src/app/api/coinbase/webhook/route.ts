import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';

/**
 * NOTE: Coinbase Commerce integration was discontinued in January 2026.
 * This endpoint is preserved to gracefully reject any lingering webhooks from Coinbase.
 *
 * Historical crypto payment transaction data is preserved in the database.
 * The webhook endpoint should be disabled in the Coinbase Commerce dashboard.
 */
export async function POST(_request: NextRequest): Promise<NextResponse<unknown>> {
  return NextResponse.json(
    { error: 'Coinbase Commerce integration has been discontinued as of January 2026' },
    { status: 410 }
  );
}
