import type { SimulationCommand } from '@/components/mission/roverBlockly';

/**
 * Parse the rover Python a mission stores into simulation commands, mirroring
 * the editors' generated output (`rover.forward(speed, time)`,
 * `rover.steerLeft(deg, speed, time)`, `rover.stop()`, ...). This lets a stored
 * mission be re-simulated from its code alone, with no server round-trip.
 */
export function parseRoverCode(code: string): SimulationCommand[] {
  const commands: SimulationCommand[] = [];
  const lines = code.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();

    // Skip comments and empty lines
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Match rover.forward(speed, duration)
    let match = trimmed.match(/rover\.forward\((\d+),\s*([\d.]+)\)/);
    if (match) {
      commands.push({ command: 'forward', speed: parseInt(match[1]), duration: parseFloat(match[2]) });
      continue;
    }

    // Match rover.reverse(speed, duration)
    match = trimmed.match(/rover\.reverse\((\d+),\s*([\d.]+)\)/);
    if (match) {
      commands.push({ command: 'reverse', speed: parseInt(match[1]), duration: parseFloat(match[2]) });
      continue;
    }

    // Match rover.spinLeft(speed, duration)
    match = trimmed.match(/rover\.spinLeft\((\d+),\s*([\d.]+)\)/);
    if (match) {
      commands.push({ command: 'spinLeft', speed: parseInt(match[1]), duration: parseFloat(match[2]) });
      continue;
    }

    // Match rover.spinRight(speed, duration)
    match = trimmed.match(/rover\.spinRight\((\d+),\s*([\d.]+)\)/);
    if (match) {
      commands.push({ command: 'spinRight', speed: parseInt(match[1]), duration: parseFloat(match[2]) });
      continue;
    }

    // Match rover.steerLeft(degrees, speed, duration)
    match = trimmed.match(/rover\.steerLeft\((\d+),\s*(\d+),\s*([\d.]+)\)/);
    if (match) {
      commands.push({
        command: 'steerLeft',
        degrees: parseInt(match[1]),
        speed: parseInt(match[2]),
        duration: parseFloat(match[3]),
      });
      continue;
    }

    // Match rover.steerRight(degrees, speed, duration)
    match = trimmed.match(/rover\.steerRight\((\d+),\s*(\d+),\s*([\d.]+)\)/);
    if (match) {
      commands.push({
        command: 'steerRight',
        degrees: parseInt(match[1]),
        speed: parseInt(match[2]),
        duration: parseFloat(match[3]),
      });
      continue;
    }

    // Match rover.stop()
    if (trimmed.match(/rover\.stop\(\)/)) {
      commands.push({ command: 'stop' });
      continue;
    }
  }

  return commands;
}
