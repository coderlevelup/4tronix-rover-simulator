/**
 * Unit Tests for Task 24: Allowlist Enforcement
 *
 * User Story 21: As a learner I want the editor to restrict available commands
 * to approved rover functions so that I cannot submit unsafe code.
 *
 * Test Coverage:
 * - Approved rover commands pass validation
 * - Disallowed imports are blocked
 * - Non-rover function calls are blocked
 * - Dangerous built-ins are blocked
 * - Clear error messages are returned
 *
 * Testing Strategy:
 * - Test AllowlistService and AST analyzer
 * - Cover both safe and unsafe code patterns
 * - Verify line number reporting for errors
 * - Test edge cases (comments, multi-line, etc.)
 */

import { AllowlistService } from '@/core/application/services/AllowlistService';
import { analyzeCodeForAllowlist } from '@/infrastructure/sandbox/ast-allowlist-analyzer';

describe('allowlist enforcement', () => {
  let service: AllowlistService;

  beforeEach(() => {
    service = new AllowlistService();
  });

  describe('approved rover commands', () => {
    /**
     * Test Case 1: Valid rover movement commands pass
     * Verifies that approved rover commands are allowed
     */
    it('allows approved rover movement commands', () => {
      const safeCode = `
rover.forward(100)
rover.backward(50)
rover.turn_left(90)
rover.turn_right(45)
      `.trim();

      const result = service.analyze(safeCode);

      expect(result.isValid).toBe(true);
      expect(result.findings).toHaveLength(0);
    });

    /**
     * Test Case 2: Valid rover utility commands pass
     * Verifies wait, stop, and sensor commands
     */
    it('allows approved rover utility commands', () => {
      const safeCode = `
rover.wait(2)
rover.stop()
distance = rover.get_distance()
heading = rover.get_heading()
      `.trim();

      const result = service.analyze(safeCode);

      expect(result.isValid).toBe(true);
      expect(result.findings).toHaveLength(0);
    });

    /**
     * Test Case 3: Python built-ins are allowed
     * Verifies print, range, and control flow
     */
    it('allows safe Python built-ins', () => {
      const safeCode = `
for i in range(3):
    print("Moving forward")
    rover.forward(100)
    rover.wait(1)
      `.trim();

      const result = service.analyze(safeCode);

      expect(result.isValid).toBe(true);
      expect(result.findings).toHaveLength(0);
    });
  });

  describe('disallowed imports', () => {
    /**
     * Test Case 4: Block 'os' module import
     * Most common dangerous import
     */
    it('blocks os module import', () => {
      const unsafeCode = `
import os
rover.forward(100)
      `.trim();

      const result = service.analyze(unsafeCode);

      expect(result.isValid).toBe(false);
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].ruleId).toBe('disallowed-import');
      expect(result.findings[0].message).toContain('os');
      expect(result.findings[0].line).toBe(1);
    });

    /**
     * Test Case 5: Block 'subprocess' module
     * Prevents command execution
     */
    it('blocks subprocess module import', () => {
      const unsafeCode = `
import subprocess
subprocess.run(['rm', '-rf', '/'])
      `.trim();

      const result = service.analyze(unsafeCode);

      expect(result.isValid).toBe(false);
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].ruleId).toBe('disallowed-import');
      expect(result.findings[0].message).toContain('subprocess');
    });

    /**
     * Test Case 6: Block 'from ... import' pattern
     * Test alternative import syntax
     */
    it('blocks from ... import pattern', () => {
      const unsafeCode = `
from os import path
print(path.exists('/etc/passwd'))
      `.trim();

      const result = service.analyze(unsafeCode);

      expect(result.isValid).toBe(false);
      expect(result.findings).toHaveLength(1);
      expect(result.findings[0].message).toContain('os');
    });

    /**
     * Test Case 7: Block socket module
     * Prevents network access
     */
    it('blocks socket module for network access', () => {
      const unsafeCode = `
import socket
s = socket.socket()
      `.trim();

      const result = service.analyze(unsafeCode);

      expect(result.isValid).toBe(false);
      expect(result.findings[0].message).toContain('socket');
    });

    /**
     * Test Case 8: Block sys module
     * Prevents system introspection
     */
    it('blocks sys module', () => {
      const unsafeCode = `
import sys
sys.exit(1)
      `.trim();

      const result = service.analyze(unsafeCode);

      expect(result.isValid).toBe(false);
      expect(result.findings[0].message).toContain('sys');
    });
  });

  describe('non-rover function calls', () => {
    /**
     * Test Case 9: Block unapproved rover commands
     * Catch typos and unknown commands
     */
    it('blocks non-existent rover commands', () => {
      const unsafeCode = `
rover.hack_mainframe()
rover.delete_all_data()
      `.trim();

      const result = service.analyze(unsafeCode);

      expect(result.isValid).toBe(false);
      expect(result.findings.length).toBeGreaterThan(0);
      expect(result.findings[0].ruleId).toBe('disallowed-function');
      expect(result.findings[0].message).toContain('hack_mainframe');
    });

    /**
     * Test Case 10: Detect multiple violations
     * Test that all violations are reported
     */
    it('reports all violations in code', () => {
      const unsafeCode = `
import os
rover.hack()
import sys
      `.trim();

      const result = service.analyze(unsafeCode);

      expect(result.isValid).toBe(false);
      expect(result.findings.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('dangerous built-ins', () => {
    /**
     * Test Case 11: Block eval() function
     * Prevents code injection
     */
    it('blocks eval() built-in', () => {
      const unsafeCode = `
code = "rover.forward(100)"
eval(code)
      `.trim();

      const result = service.analyze(unsafeCode);

      expect(result.isValid).toBe(false);
      expect(result.findings[0].ruleId).toBe('dangerous-builtin');
      expect(result.findings[0].message).toContain('eval');
    });

    /**
     * Test Case 12: Block exec() function
     * Prevents code execution
     */
    it('blocks exec() built-in', () => {
      const unsafeCode = `
exec("import os")
      `.trim();

      const result = service.analyze(unsafeCode);

      expect(result.isValid).toBe(false);
      expect(result.findings[0].message).toContain('exec');
    });

    /**
     * Test Case 13: Block open() for file I/O
     * Prevents file system access
     */
    it('blocks open() built-in for file access', () => {
      const unsafeCode = `
f = open('/etc/passwd', 'r')
      `.trim();

      const result = service.analyze(unsafeCode);

      expect(result.isValid).toBe(false);
      expect(result.findings[0].message).toContain('open');
    });

    /**
     * Test Case 14: Block __import__() dynamic imports
     * Prevents runtime import injection
     */
    it('blocks __import__() for dynamic imports', () => {
      const unsafeCode = `
os_module = __import__('os')
      `.trim();

      const result = service.analyze(unsafeCode);

      expect(result.isValid).toBe(false);
      expect(result.findings[0].message).toContain('__import__');
    });
  });

  describe('error message formatting', () => {
    /**
     * Test Case 15: Error messages include line numbers
     * Helps learners locate issues
     */
    it('includes line numbers in error messages', () => {
      const unsafeCode = `
rover.forward(100)
import os
rover.backward(50)
      `.trim();

      const result = service.analyze(unsafeCode);

      expect(result.isValid).toBe(false);
      expect(result.findings[0].line).toBe(2);
    });

    /**
     * Test Case 16: Formatted error messages are readable
     * Test the formatErrorMessage helper
     */
    it('formats error messages for display to learners', () => {
      const unsafeCode = `
import os
      `.trim();

      const result = service.analyze(unsafeCode);
      const formattedMessage = service.formatErrorMessage(result.findings);

      expect(formattedMessage).toContain('violation');
      expect(formattedMessage).toContain('line');
      expect(formattedMessage).toContain('os');
    });

    /**
     * Test Case 17: No errors for valid code
     * Verify success message
     */
    it('returns success message for valid code', () => {
      const safeCode = 'rover.forward(100)';

      const result = service.analyze(safeCode);
      const formattedMessage = service.formatErrorMessage(result.findings);

      expect(formattedMessage).toContain('passed');
    });
  });

  describe('AST analyzer direct tests', () => {
    /**
     * Test Case 18: AST analyzer catches imports
     * Direct test of analyzer function
     */
    it('AST analyzer detects disallowed imports', () => {
      const unsafeCode = 'import subprocess';

      const findings = analyzeCodeForAllowlist(unsafeCode);

      expect(findings).toHaveLength(1);
      expect(findings[0].ruleId).toBe('disallowed-import');
    });

    /**
     * Test Case 19: AST analyzer catches function calls
     * Direct test of function call detection
     */
    it('AST analyzer detects non-rover function calls', () => {
      const unsafeCode = 'rover.hack_system()';

      const findings = analyzeCodeForAllowlist(unsafeCode);

      expect(findings).toHaveLength(1);
      expect(findings[0].ruleId).toBe('disallowed-function');
    });

    /**
     * Test Case 20: AST analyzer returns empty for safe code
     * Verify no false positives
     */
    it('AST analyzer returns empty array for safe code', () => {
      const safeCode = 'rover.forward(100)';

      const findings = analyzeCodeForAllowlist(safeCode);

      expect(findings).toHaveLength(0);
    });
  });
});
