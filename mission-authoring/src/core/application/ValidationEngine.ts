/**
 * Validation Engine
 *
 * Compares simulator output (from the rover) against expected output.
 * Determines if a challenge is passed or failed.
 *
 * Responsibilities:
 * - Compare drawn shapes with tolerance
 * - Run test cases
 * - Generate validation reports
 * - Determine pass/fail
 *
 * Note: This is a simplified implementation.
 * In production, you'd have more sophisticated shape recognition
 * using computer vision or detailed shape comparison algorithms.
 */

import { Challenge, ExpectedOutput, ExpectedShape } from '@/core/domain/entities/Challenge';

export interface ValidationResult {
  passed: boolean;
  score: number; // 0-100
  details: {
    totalShapesExpected: number;
    totalShapesMatched: number;
    matchPercentage: number;
    toleranceUsed: number;
    errors: string[];
  };
}

export interface DrawnShape {
  shape: string;
  points: Array<{ x: number; y: number }>;
  // Additional properties depending on shape type
  [key: string]: any;
}

export interface SimulatorOutput {
  success: boolean;
  shapes: DrawnShape[];
  consoleOutput?: string;
  errorMessage?: string;
}

/**
 * Main validation function
 * Compares simulator output against expected output
 */
export function validateChallengeOutput(
  simulatorOutput: SimulatorOutput,
  expectedOutput: ExpectedOutput
): ValidationResult {
  const errors: string[] = [];

  // Check if execution was successful
  if (!simulatorOutput.success) {
    return {
      passed: false,
      score: 0,
      details: {
        totalShapesExpected: expectedOutput.shapes.length,
        totalShapesMatched: 0,
        matchPercentage: 0,
        toleranceUsed: expectedOutput.tolerance,
        errors: ['Execution failed: ' + (simulatorOutput.errorMessage || 'Unknown error')],
      },
    };
  }

  // Check if correct number of shapes were drawn
  if (simulatorOutput.shapes.length !== expectedOutput.shapes.length) {
    errors.push(
      `Expected ${expectedOutput.shapes.length} shapes, got ${simulatorOutput.shapes.length}`
    );
  }

  // Match shapes
  let matchedCount = 0;

  for (let i = 0; i < Math.min(simulatorOutput.shapes.length, expectedOutput.shapes.length); i++) {
    const drawn = simulatorOutput.shapes[i];
    const expected = expectedOutput.shapes[i];

    if (shapeMatches(drawn, expected, expectedOutput.tolerance)) {
      matchedCount++;
    } else {
      errors.push(`Shape ${i + 1}: ${expected.shape} did not match`);
    }
  }

  const matchPercentage = (matchedCount / expectedOutput.shapes.length) * 100;
  const passed = matchPercentage >= 80; // 80% match required

  return {
    passed,
    score: Math.round(matchPercentage),
    details: {
      totalShapesExpected: expectedOutput.shapes.length,
      totalShapesMatched: matchedCount,
      matchPercentage,
      toleranceUsed: expectedOutput.tolerance,
      errors,
    },
  };
}

/**
 * Check if a drawn shape matches the expected shape
 * with tolerance
 */
function shapeMatches(drawn: DrawnShape, expected: ExpectedShape, tolerance: number): boolean {
  // Shape type must match
  if (drawn.shape !== expected.shape) {
    return false;
  }

  // Check shape-specific properties with tolerance
  switch (expected.shape) {
    case 'line':
      return compareNumber(drawn.length, expected.length, tolerance);

    case 'square':
    case 'rectangle':
      return (
        compareNumber(drawn.width, expected.width, tolerance) &&
        compareNumber(drawn.height, expected.height, tolerance)
      );

    case 'triangle':
      return (
        compareNumber(drawn.width, expected.width, tolerance) &&
        compareNumber(drawn.height, expected.height, tolerance)
      );

    case 'circle':
      return compareNumber(drawn.radius, expected.radius, tolerance);

    default:
      // For unknown shapes, just compare by type
      return true;
  }
}

/**
 * Compare two numbers with tolerance
 * tolerance is in pixels
 */
function compareNumber(actual: number | undefined, expected: number | undefined, tolerance: number): boolean {
  if (actual === undefined || expected === undefined) {
    return false;
  }

  return Math.abs(actual - expected) <= tolerance;
}

/**
 * Alternative validation using test cases
 * (if the challenge has explicit test cases)
 */
export interface TestCase {
  input: {
    code?: string;
    parameters?: Record<string, any>;
  };
  expectedOutput: any;
}

export function validateTestCases(simulatorOutput: SimulatorOutput, testCases: TestCase[]): {
  passed: boolean;
  passedCount: number;
  totalCount: number;
} {
  let passedCount = 0;

  for (const testCase of testCases) {
    // This would need to re-execute the code with different inputs
    // For now, placeholder implementation
    // In practice, you'd have a more sophisticated test runner
    passedCount++;
  }

  const passed = passedCount === testCases.length;

  return {
    passed,
    passedCount,
    totalCount: testCases.length,
  };
}

/**
 * Combine multiple validation results
 * Useful if doing shape + test case validation
 */
export function combineValidationResults(...results: ValidationResult[]): ValidationResult {
  if (results.length === 0) {
    return {
      passed: false,
      score: 0,
      details: {
        totalShapesExpected: 0,
        totalShapesMatched: 0,
        matchPercentage: 0,
        toleranceUsed: 0,
        errors: ['No validation results to combine'],
      },
    };
  }

  const avgScore = results.reduce((sum, r) => sum + r.score, 0) / results.length;
  const passed = results.every((r) => r.passed);
  const allErrors = results.flatMap((r) => r.details.errors);

  return {
    passed,
    score: Math.round(avgScore),
    details: {
      totalShapesExpected: results.reduce((sum, r) => sum + r.details.totalShapesExpected, 0),
      totalShapesMatched: results.reduce((sum, r) => sum + r.details.totalShapesMatched, 0),
      matchPercentage: avgScore,
      toleranceUsed: results[0]?.details.toleranceUsed || 10,
      errors: allErrors,
    },
  };
}

/**
 * Human-readable explanation of validation result
 */
export function getValidationExplanation(result: ValidationResult): string {
  if (result.passed) {
    return `✅ Challenge passed! You matched ${result.details.totalShapesMatched} of ${result.details.totalShapesExpected} shapes (${result.score}%).`;
  }

  if (result.details.errors.length === 0) {
    return `❌ Challenge not passed (${result.score}% match). Try again!`;
  }

  const firstError = result.details.errors[0];
  return `❌ ${firstError}`;
}