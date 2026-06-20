import { NextRequest, NextResponse } from 'next/server';
import { getFirestoreInstance } from '@/infrastructure/persistence/firebase-admin';
import { FirestoreMissionRepository } from '@/infrastructure/persistence/FirestoreMissionRepository';

interface ExecutionCompletePayload {
  id: string;
  status: 'completed' | 'failed';
  duration_ms?: number;
  error?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body: ExecutionCompletePayload = await request.json();
    const { id, status, duration_ms, error } = body;

    // Validate payload
    if (!id || !status) {
      return NextResponse.json(
        {
          success: false,
          error: 'Missing required fields: id and status',
        },
        { status: 400 }
      );
    }

    if (!['completed', 'failed'].includes(status)) {
      return NextResponse.json(
        {
          success: false,
          error: 'Invalid status. Must be "completed" or "failed"',
        },
        { status: 400 }
      );
    }

    const firestore = getFirestoreInstance();
    const repository = new FirestoreMissionRepository(firestore);

    // Look up mission by ID
    const mission = await repository.findById(id);

    if (!mission) {
      return NextResponse.json(
        {
          success: false,
          error: 'Mission not found',
        },
        { status: 404 }
      );
    }

    const completed_at = new Date().toISOString();

    // Update mission with execution metadata
    await repository.update(id, {
      status: status === 'completed' ? 'completed' : 'failed',
      completedAt: completed_at,
      executionMetadata: {
        duration_ms,
        error,
        completed_at,
      },
      executionResult: {
        isSuccessful: status === 'completed',
        consoleOutput: '',
        errorMessage: error,
      },
    });

    console.log(`[execution-complete] Mission ${id} marked as ${status}`);

    return NextResponse.json(
      {
        success: true,
        message: `Mission ${id} updated successfully`,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Execution complete error:', error);
    return NextResponse.json(
      {
        success: false,
        error: 'Internal server error',
      },
      { status: 500 }
    );
  }
}
