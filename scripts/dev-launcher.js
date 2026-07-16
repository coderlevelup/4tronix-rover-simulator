#!/usr/bin/env node

const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');

const repoRoot = path.resolve(__dirname, '..');
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
const isWindows = process.platform === 'win32';
const isMac = process.platform === 'darwin';

const services = [
  { name: 'control', label: 'Mission Control', port: 3000, script: 'dev:control', url: 'http://localhost:3000' },
  { name: 'satellite', label: 'Satellite UI', port: 3001, script: 'dev:satellite', url: 'http://localhost:3001' },
  { name: 'yard', label: 'Rover backend', port: 8523, script: 'dev:yard', url: 'http://localhost:8523' },
];

function run(script) {
  return spawn(npmCommand, ['run', script], {
    cwd: repoRoot,
    stdio: 'inherit',
  });
}

function openBrowser(url) {
  const command = isWindows ? 'cmd' : isMac ? 'open' : 'xdg-open';
  const args = isWindows ? ['/c', 'start', '', url] : [url];

  const child = spawn(command, args, {
    detached: true,
    stdio: 'ignore',
  });

  child.unref();
}

function checkPort(port) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host: '127.0.0.1', port });

    const finish = (ready) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(ready);
    };

    socket.setTimeout(500);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', () => finish(false));
  });
}

async function waitForPorts(ports, children, timeoutMs = 120000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    if (children.some((child) => child.exitCode !== null || child.signalCode !== null)) {
      return false;
    }

    const statuses = await Promise.all(ports.map(async (port) => [port, await checkPort(port)]));
    if (statuses.every(([, ready]) => ready)) return true;

    await new Promise((resolve) => setTimeout(resolve, 750));
  }

  return false;
}

function killChildren(children) {
  for (const child of children) {
    if (child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
    }
  }
}

async function main() {
  console.log('[dev] starting full stack');

  const children = services.map((service) => {
    console.log(`[dev] ${service.label}: ${service.url}`);
    const child = run(service.script);
    child.on('error', (error) => {
      console.error(`[dev] failed to start ${service.name}: ${error.message}`);
      killChildren(children);
      process.exit(1);
    });
    return child;
  });

  for (const child of children) {
    child.on('exit', (code, signal) => {
      if (code === 0 && signal === null) return;
      killChildren(children);
      process.exit(code ?? (signal ? 1 : 0));
    });
  }

  const ready = await waitForPorts(services.map((service) => service.port), children);
  if (!ready) {
    console.error('[dev] services did not become ready in time');
    killChildren(children);
    process.exit(1);
  }

  if (process.stdin.isTTY && process.stdout.isTTY && process.env.CI !== 'true') {
    console.log('[dev] opening browser tabs');
    openBrowser('http://localhost:3000');
    openBrowser('http://localhost:3001');
  }

  process.on('SIGINT', () => {
    killChildren(children);
    process.exit(130);
  });

  process.on('SIGTERM', () => {
    killChildren(children);
    process.exit(143);
  });
}

main().catch((error) => {
  console.error(`[dev] ${error.message}`);
  process.exit(1);
});
