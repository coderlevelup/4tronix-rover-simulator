import { NextRequest, NextResponse } from 'next/server';

const YARD_SERVER_URL = process.env.YARD_SERVER_URL || 'http://localhost:8523';

export async function POST(request: NextRequest) {
  const body = await request.json();

  let yardResponse: Response;
  try {
    yardResponse = await fetch(`${YARD_SERVER_URL}/simulate/video`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'Yard server unreachable', detail: String(err) },
      { status: 503 }
    );
  }

  if (!yardResponse.ok) {
    const text = await yardResponse.text();
    return NextResponse.json(
      { error: 'Yard server error', detail: text },
      { status: yardResponse.status }
    );
  }

  const videoBuffer = await yardResponse.arrayBuffer();
  return new NextResponse(videoBuffer, {
    status: 200,
    headers: {
      'Content-Type': 'video/mp4',
      'Content-Disposition': `attachment; filename="simulation.mp4"`,
    },
  });
}
