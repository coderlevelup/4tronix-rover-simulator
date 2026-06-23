#!/usr/bin/env node
/**
 * Cross-platform launcher for the yard satellite web server (the operator/run UI).
 *
 * Mirrors scripts/dev-yard.js. Resolves the interpreter in this order:
 *   1. the project virtualenv  (.venv/Scripts/python.exe on Windows,
 *                               .venv/bin/python3 elsewhere)
 *   2. a system `python` (Windows) / `python3` (macOS/Linux) on PATH
 * then runs web_server.py with the working directory set to yard/satellite.
 *
 * The satellite serves on :3001 (override with the SATELLITE_PORT env var).
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
    `[satellite] virtualenv not found at ${venvPython} — falling back to "${python}" on PATH.\n` +
      `[satellite] If imports fail, create the venv and install deps:\n` +
      `[satellite]   python -m venv .venv\n` +
      `[satellite]   ${isWindows ? '.venv\\Scripts\\pip' : '.venv/bin/pip'} install -r yard/satellite/requirements.txt`
  );
}

const child = spawn(python, ['web_server.py'], {
  cwd: path.join(repoRoot, 'yard', 'satellite'),
  stdio: 'inherit',
});

child.on('exit', (code) => process.exit(code ?? 0));
child.on('error', (err) => {
  console.error(`[satellite] failed to start ${python}:`, err.message);
  process.exit(1);
});
