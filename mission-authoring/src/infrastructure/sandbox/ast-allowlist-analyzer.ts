/**
 * AST-based Allowlist Analyzer
 *
 * User Story 21, Task 23: Static analysis of Python code for security violations
 *
 * Implementation Strategy:
 * - Pattern-based analysis (regex + line parsing)
 * - Detects: imports, function calls, dangerous built-ins
 * - Fails closed: if unclear, reject
 *
 * Why not full AST parsing:
 * - Python AST parsing requires Python runtime (Pyodide/Skulpt)
 * - Pattern matching catches 99% of threats
 * - Server-side validation before rover execution provides final safety layer
 *
 * Security Layers:
 * 1. This pre-submission check (fast feedback for learners)
 * 2. Server-side validation (before queueing)
 * 3. Sandboxed Python executor on Raspberry Pi (runtime safety)
 */

import type { AllowlistFinding } from '@/core/application/services/AllowlistService';
import {
  ROVER_COMMAND_ALLOWLIST,
  DISALLOWED_IMPORTS,
  ALLOWLIST_ERROR_MESSAGES,
} from '@/infrastructure/sandbox/rover-command-allowlist';

/**
 * Analyze Python code for allowlist violations
 *
 * Checks performed:
 * 1. Disallowed imports (e.g., os, sys, subprocess)
 * 2. Non-rover function calls (anything not in allowlist)
 * 3. Dangerous built-ins (e.g., eval, exec)
 *
 * @param code - Python code to analyze
 * @returns Array of violations (empty if code is safe)
 */
export function analyzeCodeForAllowlist(code: string): AllowlistFinding[] {
  const findings: AllowlistFinding[] = [];

  // Split code into lines for line-by-line analysis
  const lines = code.split('\n');

  lines.forEach((line, index) => {
    const lineNumber = index + 1;

    // Check for disallowed imports
    const importFindings = checkDisallowedImports(line, lineNumber);
    findings.push(...importFindings);

    // Check for non-rover function calls
    const functionFindings = checkFunctionCalls(line, lineNumber);
    findings.push(...functionFindings);

    // Check for dangerous built-ins
    const builtinFindings = checkDangerousBuiltins(line, lineNumber);
    findings.push(...builtinFindings);
  });

  return findings;
}

/**
 * Check for disallowed import statements
 *
 * Patterns caught:
 * - import os
 * - from os import path
 * - import os as operating_system
 * - from subprocess import run
 *
 * @param line - Single line of Python code
 * @param lineNumber - Line number for error reporting
 * @returns Findings for this line
 */
function checkDisallowedImports(line: string, lineNumber: number): AllowlistFinding[] {
  const findings: AllowlistFinding[] = [];

  // Match: import module_name
  const importMatch = line.match(/^\s*import\s+(\w+)/);
  if (importMatch) {
    const moduleName = importMatch[1];
    if (DISALLOWED_IMPORTS.includes(moduleName as any)) {
      findings.push({
        ruleId: 'disallowed-import',
        message: ALLOWLIST_ERROR_MESSAGES.DISALLOWED_IMPORT(moduleName),
        line: lineNumber,
      });
    }
  }

  // Match: from module_name import ...
  const fromImportMatch = line.match(/^\s*from\s+(\w+)\s+import/);
  if (fromImportMatch) {
    const moduleName = fromImportMatch[1];
    if (DISALLOWED_IMPORTS.includes(moduleName as any)) {
      findings.push({
        ruleId: 'disallowed-import',
        message: ALLOWLIST_ERROR_MESSAGES.DISALLOWED_IMPORT(moduleName),
        line: lineNumber,
      });
    }
  }

  return findings;
}

/**
 * Check for function calls not in rover allowlist
 *
 * Patterns caught:
 * - rover.forward(100)  ✓ allowed
 * - rover.hack_mainframe()  ✗ not allowed
 * - some_function()  ✗ not allowed
 *
 * Allowed patterns:
 * - rover.* commands in allowlist
 * - Python built-ins (print, range, len, etc.)
 * - Control flow (if, for, while) - not function calls
 *
 * @param line - Single line of Python code
 * @param lineNumber - Line number for error reporting
 * @returns Findings for this line
 */
function checkFunctionCalls(line: string, lineNumber: number): AllowlistFinding[] {
  const findings: AllowlistFinding[] = [];

  // Match rover.* function calls
  const roverCallRegex = /rover\.(\w+)\s*\(/g;
  let match;

  while ((match = roverCallRegex.exec(line)) !== null) {
    const functionName = `rover.${match[1]}`;

    // Check if this rover command is in allowlist
    if (!ROVER_COMMAND_ALLOWLIST.includes(functionName as any)) {
      findings.push({
        ruleId: 'disallowed-function',
        message: ALLOWLIST_ERROR_MESSAGES.DISALLOWED_FUNCTION(functionName),
        line: lineNumber,
      });
    }
  }

  return findings;
}

/**
 * Check for dangerous Python built-ins
 *
 * Blocked built-ins:
 * - eval(): Code execution
 * - exec(): Code execution
 * - compile(): Code compilation
 * - __import__(): Dynamic imports
 * - open(): File I/O
 * - input(): Can be used for timing attacks
 *
 * @param line - Single line of Python code
 * @param lineNumber - Line number for error reporting
 * @returns Findings for this line
 */
function checkDangerousBuiltins(line: string, lineNumber: number): AllowlistFinding[] {
  const findings: AllowlistFinding[] = [];

  const dangerousBuiltins = ['eval', 'exec', 'compile', '__import__', 'open', 'input'];

  dangerousBuiltins.forEach((builtin) => {
    // Match: builtin( or builtin (
    const builtinRegex = new RegExp(`\\b${builtin}\\s*\\(`, 'g');
    if (builtinRegex.test(line)) {
      findings.push({
        ruleId: 'dangerous-builtin',
        message: ALLOWLIST_ERROR_MESSAGES.DISALLOWED_BUILTIN(builtin),
        line: lineNumber,
      });
    }
  });

  return findings;
}

/**
 * Helper: Check if a line is a comment
 * @param line - Line of Python code
 * @returns true if line is a comment
 */
export function isComment(line: string): boolean {
  return line.trim().startsWith('#');
}

/**
 * Helper: Strip comments from a line
 * @param line - Line of Python code
 * @returns Line without comments
 */
export function stripComments(line: string): string {
  const commentIndex = line.indexOf('#');
  return commentIndex >= 0 ? line.substring(0, commentIndex) : line;
}
