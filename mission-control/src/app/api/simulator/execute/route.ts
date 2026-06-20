import { NextRequest, NextResponse } from 'next/server';

/**
 * POST /api/simulator/execute
 * Executes rover code in the simulator and returns the state trace
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { code, missionId } = body;

    if (!code) {
      return NextResponse.json(
        { success: false, error: 'Mission code is required' },
        { status: 400 }
      );
    }

    // Get simulator service URL from environment
    const simulatorUrl = process.env.SIMULATOR_SERVICE_URL || 'http://localhost:8080';

    // Prepare instruction for simulator in the format it expects
    const instructions = [
      {
        apiVersion: 'v1',
        cmd: 'run_python',
        params: {
          code: code,
          id: missionId || 'simulator-test',
        },
      },
    ];

    // Call the simulator service
    const simulatorResponse = await fetch(`${simulatorUrl}/queue/add`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(instructions),
    });

    if (!simulatorResponse.ok) {
      const errorData = await simulatorResponse.json().catch(() => ({}));
      return NextResponse.json(
        {
          success: false,
          error: errorData.error || `Simulator service returned status ${simulatorResponse.status}`,
          validationErrors: errorData.validation_errors,
        },
        { status: simulatorResponse.status }
      );
    }

    const simulatorData = await simulatorResponse.json();

    // Check if simulation was successful
    if (simulatorData.status === 'error') {
      return NextResponse.json(
        {
          success: false,
          error: simulatorData.error || 'Simulation failed',
          validationErrors: simulatorData.validation_errors,
        },
        { status: 400 }
      );
    }

    // Extract trajectory from the first instruction result
    const instructionResult = simulatorData.instructions?.[0];
    const trajectory = instructionResult?.trajectory || [];
    const finalPosition = instructionResult?.final_position;

    // Return the simulation results
    return NextResponse.json({
      success: true,
      states: trajectory,
      finalPosition: finalPosition,
      executionTime: instructionResult?.executionTime,
      message: `Simulation completed with ${trajectory.length} frames`,
    });
  } catch (error) {
    console.error('Simulator execution error:', error);

    const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

    return NextResponse.json(
      {
        success: false,
        error: `Failed to execute simulation: ${errorMessage}`,
      },
      { status: 500 }
    );
  }
}
