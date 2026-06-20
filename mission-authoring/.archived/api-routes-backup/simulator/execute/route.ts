/**
 * POST /api/simulator/execute - Proxy to Simulator Service
 *
 * Proxies code execution requests to the Python simulator service
 * to avoid CORS issues when calling from the browser.
 */

import { NextRequest, NextResponse } from 'next/server';

const SIMULATOR_URL = process.env.SIMULATOR_URL || 'http://localhost:8080';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code } = body;

    if (!code) {
      return NextResponse.json(
        { success: false, error: 'No code provided' },
        { status: 400 }
      );
    }

    // Forward request to simulator service
    const response = await fetch(`${SIMULATOR_URL}/api/execute`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code }),
    });

    const data = await response.json();

    return NextResponse.json(data, { status: response.status });
  } catch (error) {
    console.error('Simulator proxy error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to communicate with simulator service',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
