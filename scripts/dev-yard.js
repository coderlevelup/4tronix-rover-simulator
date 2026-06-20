#!/usr/bin/env node
/**
 * Cross-platform launcher for the yard rover server.
 *
 * Replaces the old shell-only `cd yard/rover && ../../.venv/bin/python3 ...`,
 * which broke on Windows (no `bin/` dir — it's `Scripts/python.exe` — and cmd
 * doesn't understand the chained POSIX command).
 *
 * Resolves the interpreter in this order:
 *   1. the project virtualenv  (.venv/Scripts/python.exe on Windows,
 *                               .venv/bin/python3 elsewhere)
 *   2. a system `python` (Windows) / `python3` (macOS/Linux) on PATH
 * then runs rover_server.py with the working directory set to yard/rover.
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const isWindows = process.platform === 'win32';

const venvPython = isWindows
  ? path.join(repoRoot, '.venv', 'Scripts', 'python.exe')
  : path.join(repoRoot, '.venv', 'bin', 'python3');

const python = fs.existsSync(venvPython)
  ? venvPython
  : isWindows
    ? 'python'
    : 'python3';

if (!fs.existsSync(venvPython)) {
  console.warn(
    `[yard] virtualenv not found at ${venvPython} — falling back to "${python}" on PATH.\n` +
      `[yard] If imports fail, create the venv and install deps:\n` +
      `[yard]   python -m venv .venv\n` +
      `[yard]   ${isWindows ? '.venv\\Scripts\\pip' : '.venv/bin/pip'} install -r yard/rover/requirements.txt`
  );
}

const child = spawn(python, ['rover_server.py'], {
  cwd: path.join(repoRoot, 'yard', 'rover'),
  stdio: 'inherit',
});

child.on('exit', (code) => process.exit(code ?? 0));
child.on('error', (err) => {
  console.error(`[yard] failed to start ${python}:`, err.message);
  process.exit(1);
});
