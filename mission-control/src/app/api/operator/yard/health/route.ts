import { NextRequest, NextResponse } from 'next/server';

/**
 * GET /api/operator/yard/health
 * Checks whether the yard server (port 8523) is reachable.
 * Returns { reachable: boolean, driver?: string, queueSize?: number }
 */
export async function GET(_request: NextRequest) {
  const yardUrl = process.env.YARD_SERVER_URL || 'http://localhost:8523';

  try {
    const response = await fetch(`${yardUrl}/health`, {
      signal: AbortSignal.timeout(2000),
    });

    if (!response.ok) {
      return NextResponse.json({ reachable: false });
    }

    const data = await response.json();
    return NextResponse.json({
      reachable: true,
      driver: data.driver,
      queueSize: data.queue_size,
    });
  } catch {
    return NextResponse.json({ reachable: false });
  }
}
