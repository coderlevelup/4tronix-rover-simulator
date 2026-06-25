/**
 * Allowlist Service
 *
 * User Story 21, Tasks 22-23: Validate learner code against rover command allowlist
 *
 * Responsibilities:
 * - Coordinate AST analysis
 * - Enforce rover command allowlist
 * - Return clear violation messages for learners
 *
 * Security Approach:
 * - Static analysis (no code execution)
 * - Fail-closed (reject if analysis errors)
 * - Detailed error messages for learning
 */

import { analyzeCodeForAllowlist } from '@/infrastructure/sandbox/ast-allowlist-analyzer';

/**
 * Represents a single allowlist violation found in learner code
 *
 * @property ruleId - Unique identifier for the violation type
 * @property message - Human-readable explanation for learners
 * @property line - Line number where violation occurs (optional)
 * @property column - Column number where violation occurs (optional)
 */
export interface AllowlistFinding {
  ruleId: string;
  message: string;
  line?: number;
  column?: number;
}

/**
 * Validation result for code allowlist check
 */
export interface AllowlistValidationResult {
  isValid: boolean;
  findings: AllowlistFinding[];
  error?: string;
}

export class AllowlistService {
  /**
   * Analyze learner code for allowlist violations
   *
   * Process:
   * 1. Parse Python code into AST
   * 2. Check all imports against DISALLOWED_IMPORTS
   * 3. Check all function calls against ROVER_COMMAND_ALLOWLIST
   * 4. Return all violations found
   *
   * @param code - Python code submitted by learner
   * @returns Validation result with findings
   *
   * Returns empty findings array if code is safe
   * Returns findings array with violations if code is unsafe
   */
  analyze(code: string): AllowlistValidationResult {
    try {
      // Delegate to AST analyzer for detailed parsing
      const findings = analyzeCodeForAllowlist(code);

      return {
        isValid: findings.length === 0,
        findings,
      };
    } catch (error) {
      // If AST parsing fails, reject the code
      // This prevents bypass via malformed syntax
      return {
        isValid: false,
        findings: [],
        error: error instanceof Error ? error.message : 'Code analysis failed',
      };
    }
  }

  /**
   * Quick validation check - returns boolean only
   *
   * @param code - Python code to validate
   * @returns true if code passes allowlist, false otherwise
   */
  isCodeAllowed(code: string): boolean {
    const result = this.analyze(code);
    return result.isValid;
  }

  /**
   * Get formatted error message for learners
   *
   * @param findings - Array of allowlist violations
   * @returns Human-readable error message with line numbers
   */
  formatErrorMessage(findings: AllowlistFinding[]): string {
    if (findings.length === 0) {
      return 'Code passed allowlist validation.';
    }

    const messages = findings.map((finding) => {
      const location = finding.line ? ` (line ${finding.line})` : '';
      return `- ${finding.message}${location}`;
    });

    return `Code contains ${findings.length} allowlist violation(s):\n${messages.join('\n')}`;
  }
}
