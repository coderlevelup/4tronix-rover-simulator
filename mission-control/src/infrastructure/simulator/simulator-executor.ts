import type { RoverCommand, RoverPose } from '@/infrastructure/simulator/rover-movement';
import { applyRoverCommand } from '@/infrastructure/simulator/rover-movement';

export function runSimulator(commands: RoverCommand[], initialPose: RoverPose): RoverPose[] {
  // TODO: User Story 27 / Task 30 - connect the editor run button to this execution pipeline.
  const poses = [initialPose];

  for (const command of commands) {
    poses.push(applyRoverCommand(poses[poses.length - 1], command));
  }

  return poses;
}
