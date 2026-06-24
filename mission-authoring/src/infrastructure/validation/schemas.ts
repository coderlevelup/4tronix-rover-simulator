/**
 * Validation Schemas (Task 37, Task 23)
 *
 * Uses Zod for runtime validation with full TypeScript inference.
 * Validates mission submissions to ensure data integrity and security.
 *
 * Validation Layers:
 * 1. Schema validation (Zod): Required fields, types, formats
 * 2. Allowlist validation (Task 23): Approved rover commands only
 * 3. Length/size limits: Prevent resource exhaustion
 *
 * User Story 21 Integration:
 * - Code validation includes allowlist check
 * - Blocks disallowed imports (os, sys, subprocess, etc.)
 * - Only permits approved rover commands
 */

import { z } from 'zod';
import { AllowlistService } from '@/core/application/services/AllowlistService';

/**
 * Schema for creating a new mission (anonymous submission)
 * Maps to POST /api/missions request body
 */
export const createMissionSchema = z.object({
  yardId: z
    .string()
    .min(1, 'Yard ID is required')
    .max(50, 'Yard ID too long')
    .regex(/^[a-zA-Z0-9-_]+$/, 'Yard ID must contain only alphanumeric characters, hyphens, and underscores'),

  learnerId: z
    .string()
    .min(1, 'Learner ID is required')
    .max(100, 'Learner ID too long'),

  sessionId: z
    .string()
    .min(1, 'Session ID is required')
    .max(100, 'Session ID too long'),

  learnerEmail: z
    .string()
    .email('Invalid email address')
    .max(254, 'Email too long')
    .optional(),

  name: z
    .string()
    .min(1, 'Mission name is required')
    .max(100, 'Mission name too long'),

  code: z
    .string()
    .min(1, 'Code cannot be empty')
    .max(10000, 'Code exceeds maximum length of 10,000 characters')
    .refine((code) => code.trim().length > 0, {
      message: 'Code cannot be only whitespace',
    }),

  blocklyState: z.string().optional(),
});

/**
 * Inferred TypeScript type from schema
 */
export type CreateMissionDto = z.infer<typeof createMissionSchema>;

/**
 * Schema for mission status updates
 * Used by operator console and execution agent
 */
export const updateMissionSchema = z.object({
  status: z.enum(['queued', 'processing', 'completed', 'failed', 'cancelled']).optional(),

  executionResult: z.object({
    isSuccessful: z.boolean(),
    consoleOutput: z.string(),
    errorMessage: z.string().optional(),
  }).optional(),

  videoUrl: z.string().url().optional(),
  youtubeUrl: z.string().url().optional(),

  startedAt: z.string().datetime().optional(),
  completedAt: z.string().datetime().optional(),
}).strict();

export type UpdateMissionDto = z.infer<typeof updateMissionSchema>;

/**
 * Validation helper that returns formatted error messages
 *
 * Performs two-phase validation:
 * 1. Schema validation (Zod)
 * 2. Allowlist validation (User Story 21)
 *
 * @param data - Mission submission data
 * @returns Validation result with errors if any
 */
export function validateMission(data: unknown): {
  success: boolean;
  data?: CreateMissionDto;
  errors?: string[];
} {
  // Phase 1: Schema validation (required fields, types, formats)
  const result = createMissionSchema.safeParse(data);

  if (!result.success) {
    const errors = result.error.errors.map((err) => {
      const path = err.path.join('.');
      return `${path}: ${err.message}`;
    });

    return { success: false, errors };
  }

  // Phase 2: Allowlist validation (User Story 21, Task 23)
  // Check code against approved rover commands
  const allowlistService = new AllowlistService();
  const allowlistResult = allowlistService.analyze(result.data.code);

  if (!allowlistResult.isValid) {
    // If analysis error occurred
    if (allowlistResult.error) {
      return {
        success: false,
        errors: [`code: ${allowlistResult.error}`],
      };
    }

    // Convert allowlist findings to error messages
    const allowlistErrors = allowlistResult.findings.map((finding) => {
      const location = finding.line ? ` (line ${finding.line})` : '';
      return `code${location}: ${finding.message}`;
    });

    return { success: false, errors: allowlistErrors };
  }

  // Both validations passed
  return { success: true, data: result.data };
}
