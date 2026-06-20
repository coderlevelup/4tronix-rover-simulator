import { NextResponse } from 'next/server';

type QueueRouteContext = {
  params: Promise<{
    yardId: string;
  }>;
};

export async function GET(_request: Request, context: QueueRouteContext) {
  const { yardId } = await context.params;

  // TODO: User Story 43 / Task 45 - return the ordered mission queue for this yard.
  // TODO: User Story 43 / Task 47 - validate submitted missions appear in FIFO order.
  return NextResponse.json(
    {
      success: false,
      yardId,
      error: 'Not implemented',
      todo: [
        'User Story 43 / Task 45 - Implement GET /queue/{yard_id} with ordered mission list.',
        'User Story 43 / Task 46 - Add queue ordering and FIFO tests.',
        'User Story 43 / Task 47 - Verify integration ordering after submissions.',
      ],
    },
    { status: 501 }
  );
}
