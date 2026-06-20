import { NextResponse } from 'next/server';
import { YardStatusService } from '@/core/application/services/YardStatusService';

type YardStatusRouteContext = {
  params: Promise<{
    yardId: string;
  }>;
};

export async function GET(_request: Request, context: YardStatusRouteContext) {
  const { yardId } = await context.params;

  try {
    const yardStatusService = new YardStatusService();
    const status = await yardStatusService.getStatus(yardId);

    if (!status) {
      return NextResponse.json(
        {
          success: false,
          error: 'Yard not found',
        },
        { status: 404 }
      );
    }

    const yard = {
      id: yardId,
      name: 'Gale Crater Yard',
      status,
    };

    return NextResponse.json(
      {
        success: true,
        yard,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Yard status fetch error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
      },
      { status: 500 }
    );
  }
}

export async function PATCH(_request: Request, context: YardStatusRouteContext) {
  const { yardId } = await context.params;

  try {
    const body = await _request.json();
    const { status } = body;

    if (!status || !['offline', 'remote', 'on-site'].includes(status)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid status. Must be "offline", "remote", or "on-site"',
        },
        { status: 400 }
      );
    }

    // User Story 48 / Task 49 - Update yard status
    // User Story 48 / Task 51 - Prevent dispatch while in maintenance mode
    const yardStatusService = new YardStatusService();
    const updatedYard = await yardStatusService.updateStatus(yardId, status);

    if (!updatedYard) {
      return NextResponse.json(
        {
          success: false,
          error: 'Failed to update yard status',
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        yard: updatedYard,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Yard status update error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
      },
      { status: 500 }
    );
  }
}
