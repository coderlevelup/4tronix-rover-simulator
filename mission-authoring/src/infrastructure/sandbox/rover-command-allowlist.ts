/**
 * Rover Command Allowlist
 *
 * User Story 21, Task 22: Define approved rover functions and blocked imports
 *
 * Security Model:
 * - Learners can only call functions in ROVER_COMMAND_ALLOWLIST
 * - All imports from DISALLOWED_IMPORTS are blocked
 * - Python built-ins like print() are allowed for debugging
 * - AST analysis prevents runtime sandbox escapes
 *
 * Design Philosophy:
 * - Start restrictive, expand as needed
 * - Prefer explicit allowlist over denylist
 * - Clear error messages guide learners to safe alternatives
 */

/**
 * Approved rover control commands
 *
 * Movement Commands:
 * - forward(distance_cm): Move forward specified distance in centimeters
 * - backward(distance_cm): Move backward specified distance
 * - turn_left(degrees): Rotate left by specified degrees
 * - turn_right(degrees): Rotate right by specified degrees
 *
 * Utility Commands:
 * - wait(seconds): Pause execution for specified seconds
 * - stop(): Emergency stop (halts all motion)
 *
 * Sensor Commands:
 * - get_distance(): Read ultrasonic sensor (returns cm)
 * - get_heading(): Read compass heading (returns degrees)
 *
 * All commands are called as `rover.command_name(args)`
 */
export const ROVER_COMMAND_ALLOWLIST = [
  // Movement commands
  'rover.forward',
  'rover.backward',
  'rover.reverse',
  'rover.turn_left',
  'rover.turn_right',
  'rover.spinLeft',
  'rover.spinRight',
  'rover.steerLeft',
  'rover.steerRight',

  // Utility commands
  'rover.wait',
  'rover.stop',

  // Sensor commands (for future challenges)
  'rover.get_distance',
  'rover.get_heading',

  // Low-level rover API emitted by the Blockly generator (runs on the rover via
  // the yard): servo positioning, distance read, and NeoPixel LEDs.
  'rover.setServo',
  'rover.getDistance',
  'rover.setColor',
  'rover.fromRGB',
  'rover.setPixel',
  'rover.show',
] as const;

/**
 * Allowed Python built-ins for learner code
 *
 * Allowed for basic programming:
 * - print(): Debug output
 * - range(): Loop iteration
 * - len(): Get length
 * - int(), float(), str(): Type conversions
 * - abs(), min(), max(): Math operations
 *
 * Control flow (if, for, while) is allowed by default
 */
export const ALLOWED_BUILTINS = [
  'print',
  'range',
  'len',
  'int',
  'float',
  'str',
  'abs',
  'min',
  'max',
] as const;

/**
 * Disallowed Python imports (security risk)
 *
 * Blocked Categories:
 * 1. System access: os, sys, subprocess
 * 2. File I/O: pathlib, io, open
 * 3. Network: socket, urllib, requests
 * 4. Code execution: eval, exec, compile, __import__
 * 5. Introspection: inspect, types, importlib
 *
 * Why blocking is necessary:
 * - Prevents sandbox escape
 * - Protects rover hardware
 * - Prevents resource exhaustion
 * - Blocks network attacks
 */
export const DISALLOWED_IMPORTS = [
  // System access
  'os',
  'sys',
  'subprocess',

  // File I/O
  'pathlib',
  'io',
  'open',

  // Network
  'socket',
  'urllib',
  'requests',
  'http',

  // Code execution
  'eval',
  'exec',
  'compile',
  '__import__',

  // Introspection/metaprogramming
  'inspect',
  'types',
  'importlib',

  // Other dangerous modules
  'pickle',  // Arbitrary code execution
  'ctypes',  // C library access
  'multiprocessing',  // Process spawning
  'threading',  // Resource exhaustion
] as const;

/**
 * Error messages for blocked code patterns
 */
export const ALLOWLIST_ERROR_MESSAGES = {
  DISALLOWED_IMPORT: (moduleName: string) =>
    `Import of '${moduleName}' is not allowed. Only rover commands are permitted.`,

  DISALLOWED_FUNCTION: (functionName: string) =>
    `Function '${functionName}' is not in the approved rover command list. ` +
    `Allowed commands: ${ROVER_COMMAND_ALLOWLIST.join(', ')}`,

  DISALLOWED_BUILTIN: (builtinName: string) =>
    `Built-in function '${builtinName}' is not allowed for safety reasons.`,
} as const;

// Type exports for TypeScript safety
export type RoverCommand = typeof ROVER_COMMAND_ALLOWLIST[number];
export type DisallowedImport = typeof DISALLOWED_IMPORTS[number];
export type AllowedBuiltin = typeof ALLOWED_BUILTINS[number];
