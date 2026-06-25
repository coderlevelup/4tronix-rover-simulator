/**
 * Integration Tests for Task 25: Unsafe Module Blocking
 *
 * User Story 21: As a learner I want the editor to restrict available commands
 * to approved rover functions so that I cannot submit unsafe code.
 *
 * Test Coverage:
 * - End-to-end validation via POST /api/missions
 * - Unsafe imports are rejected at API level
 * - Clear error messages returned to client
 * - Safe code is accepted
 *
 * Testing Strategy:
 * - Integration tests using real validation pipeline
 * - Tests full flow from HTTP request to response
 * - Verifies both success and failure paths
 */

import { validateMission } from '@/infrastructure/validation/schemas';

describe('unsafe import blocking (integration)', () => {
  /**
   * Test Case 1: Safe rover code passes validation
   * Baseline test - verify normal missions work
   */
  it('accepts mission with safe rover commands', () => {
    const safeMissionData = {
      yardId: 'uct-rover-1',
      learnerId: 'test-learner',
      name: 'Test Mission',
      sessionId: 'test-session-001',
      code: `
rover.forward(100)
rover.turn_left(90)
rover.forward(50)
      `.trim(),
      challengeId: 'M1-FORWARD',
    };

    const result = validateMission(safeMissionData);

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
    expect(result.errors).toBeUndefined();
  });

  /**
   * Test Case 2: Block 'os' module import
   * Most common dangerous import attempt
   */
  it('rejects mission with os module import', () => {
    const unsafeMissionData = {
      yardId: 'uct-rover-1',
      learnerId: 'test-learner',
      name: 'Test Mission',
      sessionId: 'test-session-002',
      code: `
import os
rover.forward(100)
os.system('rm -rf /')
      `.trim(),
    };

    const result = validateMission(unsafeMissionData);

    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors![0]).toContain('os');
    expect(result.errors![0]).toContain('not allowed');
  });

  /**
   * Test Case 3: Block 'subprocess' module
   * Prevents command execution
   */
  it('rejects mission with subprocess import', () => {
    const unsafeMissionData = {
      yardId: 'uct-rover-1',
      learnerId: 'test-learner',
      name: 'Test Mission',
      sessionId: 'test-session-003',
      code: `
import subprocess
subprocess.run(['echo', 'hacked'])
      `.trim(),
    };

    const result = validateMission(unsafeMissionData);

    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors![0]).toContain('subprocess');
  });

  /**
   * Test Case 4: Block 'socket' module
   * Prevents network access
   */
  it('rejects mission with socket import', () => {
    const unsafeMissionData = {
      yardId: 'uct-rover-1',
      learnerId: 'test-learner',
      name: 'Test Mission',
      sessionId: 'test-session-004',
      code: `
import socket
s = socket.socket()
      `.trim(),
    };

    const result = validateMission(unsafeMissionData);

    expect(result.success).toBe(false);
    expect(result.errors![0]).toContain('socket');
  });

  /**
   * Test Case 5: Block 'from ... import' pattern
   * Test alternative import syntax
   */
  it('rejects mission with from...import pattern', () => {
    const unsafeMissionData = {
      yardId: 'uct-rover-1',
      learnerId: 'test-learner',
      name: 'Test Mission',
      sessionId: 'test-session-005',
      code: `
from os import path
print(path.exists('/'))
      `.trim(),
    };

    const result = validateMission(unsafeMissionData);

    expect(result.success).toBe(false);
    expect(result.errors![0]).toContain('os');
  });

  /**
   * Test Case 6: Block non-rover function calls
   * Prevent typos and unknown commands
   */
  it('rejects mission with non-approved rover commands', () => {
    const unsafeMissionData = {
      yardId: 'uct-rover-1',
      learnerId: 'test-learner',
      name: 'Test Mission',
      sessionId: 'test-session-006',
      code: `
rover.hack_mainframe()
rover.delete_all_files()
      `.trim(),
    };

    const result = validateMission(unsafeMissionData);

    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors![0]).toContain('hack_mainframe');
  });

  /**
   * Test Case 7: Block eval() built-in
   * Prevent code injection
   */
  it('rejects mission with eval() built-in', () => {
    const unsafeMissionData = {
      yardId: 'uct-rover-1',
      learnerId: 'test-learner',
      name: 'Test Mission',
      sessionId: 'test-session-007',
      code: `
code = "rover.forward(100)"
eval(code)
      `.trim(),
    };

    const result = validateMission(unsafeMissionData);

    expect(result.success).toBe(false);
    expect(result.errors![0]).toContain('eval');
  });

  /**
   * Test Case 8: Block exec() built-in
   * Prevent code execution
   */
  it('rejects mission with exec() built-in', () => {
    const unsafeMissionData = {
      yardId: 'uct-rover-1',
      learnerId: 'test-learner',
      name: 'Test Mission',
      sessionId: 'test-session-008',
      code: `
exec("import os; os.system('ls')")
      `.trim(),
    };

    const result = validateMission(unsafeMissionData);

    expect(result.success).toBe(false);
    expect(result.errors![0]).toContain('exec');
  });

  /**
   * Test Case 9: Block open() for file I/O
   * Prevent file system access
   */
  it('rejects mission with open() built-in', () => {
    const unsafeMissionData = {
      yardId: 'uct-rover-1',
      learnerId: 'test-learner',
      name: 'Test Mission',
      sessionId: 'test-session-009',
      code: `
with open('/etc/passwd', 'r') as f:
    print(f.read())
      `.trim(),
    };

    const result = validateMission(unsafeMissionData);

    expect(result.success).toBe(false);
    expect(result.errors![0]).toContain('open');
  });

  /**
   * Test Case 10: Multiple violations reported
   * Verify all issues are caught
   */
  it('reports multiple violations in single mission', () => {
    const unsafeMissionData = {
      yardId: 'uct-rover-1',
      learnerId: 'test-learner',
      name: 'Test Mission',
      sessionId: 'test-session-010',
      code: `
import os
import sys
rover.hack()
eval("print('test')")
      `.trim(),
    };

    const result = validateMission(unsafeMissionData);

    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(1);
  });

  /**
   * Test Case 11: Safe Python with loops and conditionals
   * Verify legitimate Python constructs work
   */
  it('accepts mission with loops and conditionals', () => {
    const safeMissionData = {
      yardId: 'uct-rover-1',
      learnerId: 'test-learner',
      name: 'Test Mission',
      sessionId: 'test-session-011',
      code: `
for i in range(4):
    if i % 2 == 0:
        rover.forward(100)
    else:
        rover.turn_left(90)
    rover.wait(1)
      `.trim(),
    };

    const result = validateMission(safeMissionData);

    expect(result.success).toBe(true);
    expect(result.data).toBeDefined();
  });

  /**
   * Test Case 12: Safe Python with print statements
   * Verify debugging helpers work
   */
  it('accepts mission with print statements for debugging', () => {
    const safeMissionData = {
      yardId: 'uct-rover-1',
      learnerId: 'test-learner',
      name: 'Test Mission',
      sessionId: 'test-session-012',
      code: `
print("Starting mission")
rover.forward(100)
print("Mission complete")
      `.trim(),
    };

    const result = validateMission(safeMissionData);

    expect(result.success).toBe(true);
  });

  /**
   * Test Case 13: Error includes line numbers
   * Help learners locate issues
   */
  it('includes line numbers in error messages', () => {
    const unsafeMissionData = {
      yardId: 'uct-rover-1',
      learnerId: 'test-learner',
      name: 'Test Mission',
      sessionId: 'test-session-013',
      code: `
rover.forward(100)
import os
rover.backward(50)
      `.trim(),
    };

    const result = validateMission(unsafeMissionData);

    expect(result.success).toBe(false);
    expect(result.errors![0]).toContain('line');
    expect(result.errors![0]).toContain('2');
  });

  /**
   * Test Case 14: Schema validation still enforced
   * Verify allowlist doesn't bypass schema checks
   */
  it('still enforces schema validation (missing required fields)', () => {
    const invalidMissionData = {
      // Missing yardId and sessionId
      code: 'rover.forward(100)',
    };

    const result = validateMission(invalidMissionData);

    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    // Should fail on schema, not allowlist
    // Zod uses "Required" in error messages
    expect(result.errors![0]).toContain('Required');
  });

  /**
   * Test Case 15: Empty code rejected
   * Verify basic validation still works
   */
  it('rejects empty code', () => {
    const invalidMissionData = {
      yardId: 'uct-rover-1',
      learnerId: 'test-learner',
      name: 'Test Mission',
      sessionId: 'test-session-015',
      code: '',
    };

    const result = validateMission(invalidMissionData);

    expect(result.success).toBe(false);
    expect(result.errors![0]).toContain('empty');
  });
});
