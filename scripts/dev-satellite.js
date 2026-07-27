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
 *
 * The operator console (/operator/) needs Firebase credentials. For dev we
 * load them from .env files (real environment variables always win):
 *   1. yard/satellite/.env        (satellite-specific overrides)
 *   2. mission-control/.env       (the shared Firebase project config)
 */
const { spawn, spawnSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { freePorts } = require('./free-port');

const repoRoot = path.resolve(__dirname, '..');
const isWindows = process.platform === 'win32';

const port = Number(process.env.SATELLITE_PORT) || 3001;

/** Minimal .env parser: KEY=value lines, surrounding quotes stripped. */
function parseEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    if (line.trim().startsWith('#')) continue;
    const m = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m) continue;
    let value = m[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    out[m[1]] = value;
  }
  return out;
}

// Later spreads win: mission-control/.env < yard/satellite/.env < real env.
const env = {
  ...parseEnvFile(path.join(repoRoot, 'mission-control', '.env')),
  ...parseEnvFile(path.join(repoRoot, 'yard', 'satellite', '.env')),
  ...process.env,
};

const venvPython = isWindows
  ? path.join(repoRoot, '.venv', 'Scripts', 'python.exe')
  : path.join(repoRoot, '.venv', 'bin', 'python3');

const python = fs.existsSync(venvPython)
  ? venvPython
  : isWindows
    ? 'python'
    : 'python3';

(async () => {
  // Preflight: the satellite needs its Python deps (firebase-admin, flask, dotenv) in
  // the interpreter we run. Without them the operator login fails at runtime
  // with a cryptic "could not verify token", so install them on first run.
  // (These live in yard/satellite/requirements.txt, separate from the desktop
  // simulator's root requirements.txt.)
  const hasDeps = spawnSync(python, ['-c', 'import firebase_admin, flask, dotenv'], { stdio: 'ignore' });
  if (!hasDeps.error && hasDeps.status !== 0) {
    const reqs = path.join('yard', 'satellite', 'requirements.txt');
    console.log('[satellite] installing Python dependencies (first run)...');
    const install = spawnSync(python, ['-m', 'pip', 'install', '-r', reqs], {
      cwd: repoRoot,
      stdio: 'inherit',
    });
    if (install.status !== 0) {
      console.error('[satellite] could not install Python dependencies. Run this, then retry:');
      console.error(`[satellite]   ${python} -m pip install -r ${reqs}`);
      process.exit(1);
    }
  }

  // A previous crashed run may have left a server squatting on the port;
  // clear it (only recognized dev processes) instead of dying on EADDRINUSE.
  if (!(await freePorts([port], '[satellite]'))) process.exit(1);

  console.log(`[satellite] port ${port}`);

  const child = spawn(python, ['web_server.py'], {
    cwd: path.join(repoRoot, 'yard', 'satellite'),
    stdio: 'inherit',
    env,
  });

  child.on('exit', (code) => process.exit(code ?? 0));
  child.on('error', (err) => {
    console.error(`[satellite] failed to start ${python}:`, err.message);
    process.exit(1);
  });
})();
