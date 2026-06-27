import type { SimulationCommand } from '@/components/mission/roverBlockly';

/**
 * Parse rover Python into 2D-simulator commands.
 *
 * The canonical rover API is the low-level form the blocks generate and the
 * real rover runs:
 *
 *   rover.setServo(9, -20)   # steer the wheels
 *   rover.forward(60)        # speed only (0-100)
 *   time.sleep(1.5)          # for how long
 *   rover.stop()
 *
 * Steering is expressed through the wheel servos (front-left = 9), so a forward
 * move with a non-zero front-left servo is read as a steer. `for _ in range(n):`
 * loops are expanded. The older high-level convenience form
 * (`rover.forward(speed, time)`, `rover.steerLeft(deg, speed, time)`) is still
 * accepted so missions saved before this change keep replaying.
 */
export function parseRoverCode(code: string): SimulationCommand[] {
  return parseLinear(expandLoops(code.split('\n')));
}

function indentOf(line: string): number {
  const m = line.match(/^([ \t]*)/);
  return m ? m[1].replace(/\t/g, '    ').length : 0;
}

/** Expand `for _ in range(N):` blocks by repeating their body N times. */
function expandLoops(lines: string[]): string[] {
  const out: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const m = line.match(/^\s*for\s+\w+\s+in\s+range\(\s*(\d+)\s*\)\s*:/);
    if (!m) {
      out.push(line);
      continue;
    }
    const times = parseInt(m[1], 10);
    const headerIndent = indentOf(line);
    const body: string[] = [];
    let j = i + 1;
    while (j < lines.length) {
      const l = lines[j];
      if (l.trim() === '') {
        body.push(l);
        j++;
        continue;
      }
      if (indentOf(l) > headerIndent) {
        body.push(l);
        j++;
      } else {
        break;
      }
    }
    const expandedBody = expandLoops(body);
    for (let k = 0; k < times && k < 1000; k++) out.push(...expandedBody);
    i = j - 1;
  }
  return out;
}

type Motion = { cmd: 'forward' | 'reverse' | 'spinLeft' | 'spinRight'; speed: number };

function parseLinear(lines: string[]): SimulationCommand[] {
  const commands: SimulationCommand[] = [];
  // Front-left wheel servo (9) tells us whether a forward move is steering.
  const servos: Record<number, number> = { 9: 0, 11: 0, 13: 0, 15: 0 };
  let motion: Motion | null = null;

  const emitSleep = (seconds: number) => {
    if (!motion || motion.speed <= 0) return; // a bare wait keeps the rover still
    commands.push(toCommand(motion, servos[9], seconds));
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;

    let m: RegExpMatchArray | null;

    // --- High-level convenience form (older missions) ---------------------
    if ((m = line.match(/rover\.forward\(\s*(\d+)\s*,\s*([\d.]+)\s*\)/))) {
      commands.push({ command: 'forward', speed: parseInt(m[1]), duration: parseFloat(m[2]) });
      continue;
    }
    if ((m = line.match(/rover\.reverse\(\s*(\d+)\s*,\s*([\d.]+)\s*\)/))) {
      commands.push({ command: 'reverse', speed: parseInt(m[1]), duration: parseFloat(m[2]) });
      continue;
    }
    if ((m = line.match(/rover\.spinLeft\(\s*(\d+)\s*,\s*([\d.]+)\s*\)/))) {
      commands.push({ command: 'spinLeft', speed: parseInt(m[1]), duration: parseFloat(m[2]) });
      continue;
    }
    if ((m = line.match(/rover\.spinRight\(\s*(\d+)\s*,\s*([\d.]+)\s*\)/))) {
      commands.push({ command: 'spinRight', speed: parseInt(m[1]), duration: parseFloat(m[2]) });
      continue;
    }
    if ((m = line.match(/rover\.steerLeft\(\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/))) {
      commands.push({ command: 'steerLeft', degrees: parseInt(m[1]), speed: parseInt(m[2]), duration: parseFloat(m[3]) });
      continue;
    }
    if ((m = line.match(/rover\.steerRight\(\s*(\d+)\s*,\s*(\d+)\s*,\s*([\d.]+)\s*\)/))) {
      commands.push({ command: 'steerRight', degrees: parseInt(m[1]), speed: parseInt(m[2]), duration: parseFloat(m[3]) });
      continue;
    }

    // --- Real low-level form (blocks + real rover) ------------------------
    if ((m = line.match(/rover\.setServo\(\s*(\d+)\s*,\s*(-?[\d.]+)\s*\)/))) {
      servos[parseInt(m[1])] = parseFloat(m[2]);
      continue;
    }
    if ((m = line.match(/rover\.forward\(\s*(\d+(?:\.\d+)?)\s*\)/))) {
      motion = { cmd: 'forward', speed: parseFloat(m[1]) };
      continue;
    }
    if ((m = line.match(/rover\.reverse\(\s*(\d+(?:\.\d+)?)\s*\)/))) {
      motion = { cmd: 'reverse', speed: parseFloat(m[1]) };
      continue;
    }
    if ((m = line.match(/rover\.spinLeft\(\s*(\d+(?:\.\d+)?)\s*\)/))) {
      motion = { cmd: 'spinLeft', speed: parseFloat(m[1]) };
      continue;
    }
    if ((m = line.match(/rover\.spinRight\(\s*(\d+(?:\.\d+)?)\s*\)/))) {
      motion = { cmd: 'spinRight', speed: parseFloat(m[1]) };
      continue;
    }
    if (line.match(/rover\.stop\(\)/)) {
      motion = null;
      continue;
    }
    if ((m = line.match(/time\.sleep\(\s*([\d.]+)\s*\)/))) {
      emitSleep(parseFloat(m[1]));
      continue;
    }
    // Everything else (LEDs, mast, distance, photo, print) has no 2D effect.
  }

  return commands;
}

/** Turn an active motion + steering state into a single sim command. */
function toCommand(motion: Motion, frontLeftServo: number, duration: number): SimulationCommand {
  if (motion.cmd === 'forward') {
    if (frontLeftServo < 0) {
      return { command: 'steerLeft', degrees: Math.abs(frontLeftServo), speed: motion.speed, duration };
    }
    if (frontLeftServo > 0) {
      return { command: 'steerRight', degrees: frontLeftServo, speed: motion.speed, duration };
    }
  }
  return { command: motion.cmd, speed: motion.speed, duration };
}
