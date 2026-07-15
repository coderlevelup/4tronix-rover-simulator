#!/usr/bin/env node
/**
 * Free TCP ports held by stale dev servers before (re)starting ours.
 *
 * A crashed `npm run dev` (or a forgotten terminal) leaves next/flask servers
 * squatting on 3000/3001/8523, and the next start dies with EADDRINUSE. This
 * kills those leftovers automatically. Safety valve: only processes that look
 * like this repo's dev stack (node/next/python/flask) are killed; anything
 * unrecognized is reported and left alone, and the script exits non-zero so
 * the launcher stops instead of fighting it.
 *
 * CLI:  node scripts/free-port.js 3000 [3001 ...]
 * Lib:  await require('./free-port').freePorts([3001], '[satellite]')
 */
const { execSync } = require('node:child_process');

const KILLABLE = /node|next|python|flask/i;
const isWindows = process.platform === 'win32';

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function run(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch {
    return ''; // no matches (lsof/findstr exit non-zero when nothing is found)
  }
}

/** [{ pid, command }] currently LISTENing on the port. */
function listeners(port) {
  if (isWindows) {
    const rows = run(`netstat -ano -p tcp | findstr LISTENING | findstr :${port}`);
    const pids = new Set();
    for (const line of rows.split('\n')) {
      const cols = line.trim().split(/\s+/);
      // TCP  0.0.0.0:3000  0.0.0.0:0  LISTENING  1234
      if (cols[1] && cols[1].endsWith(`:${port}`) && cols[4]) pids.add(Number(cols[4]));
    }
    return [...pids].map((pid) => {
      const csv = run(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`);
      const command = (csv.match(/^"([^"]+)"/) || [])[1] || 'unknown';
      return { pid, command };
    });
  }

  // -Fpc = machine-readable: p<pid> and c<command> lines
  const out = run(`lsof -nP -iTCP:${port} -sTCP:LISTEN -Fpc`);
  const found = [];
  let pid = null;
  for (const line of out.split('\n')) {
    if (line.startsWith('p')) pid = Number(line.slice(1));
    if (line.startsWith('c') && pid) {
      found.push({ pid, command: line.slice(1) });
      pid = null;
    }
  }
  return found;
}

function kill(pid, force) {
  try {
    if (isWindows) {
      run(`taskkill /PID ${pid} ${force ? '/F' : ''}`);
    } else {
      process.kill(pid, force ? 'SIGKILL' : 'SIGTERM');
    }
  } catch {
    // already gone
  }
}

async function freePorts(ports, tag = '[free-port]') {
  for (const port of ports) {
    const holders = listeners(port);
    if (holders.length === 0) continue;

    const strangers = holders.filter((h) => !KILLABLE.test(h.command));
    if (strangers.length > 0) {
      for (const s of strangers) {
        console.error(
          `${tag} port ${port} is held by "${s.command}" (pid ${s.pid}), which does not look ` +
            `like one of our dev servers - not killing it. Stop it yourself, e.g.: kill ${s.pid}`
        );
      }
      process.exitCode = 1;
      return false;
    }

    for (const h of holders) {
      console.log(`${tag} port ${port} in use by stale "${h.command}" (pid ${h.pid}) - killing it`);
      kill(h.pid, false);
    }

    // Give it a moment to die politely; escalate if it lingers.
    for (let attempt = 0; attempt < 20 && listeners(port).length > 0; attempt++) {
      if (attempt === 10) holders.forEach((h) => kill(h.pid, true));
      await sleep(100);
    }

    if (listeners(port).length > 0) {
      console.error(`${tag} could not free port ${port}`);
      process.exitCode = 1;
      return false;
    }
  }
  return true;
}

module.exports = { freePorts };

if (require.main === module) {
  const ports = process.argv.slice(2).map(Number).filter(Boolean);
  if (ports.length === 0) {
    console.error('Usage: node scripts/free-port.js <port> [<port> ...]');
    process.exit(1);
  }
  freePorts(ports).then((ok) => process.exit(ok ? 0 : 1));
}
