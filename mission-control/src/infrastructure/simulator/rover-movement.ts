export type RoverHeading = 'north' | 'east' | 'south' | 'west';

export type RoverCommand =
  | { type: 'forward'; value: number }
  | { type: 'backward'; value: number }
  | { type: 'turn-left'; value: number }
  | { type: 'turn-right'; value: number }
  | { type: 'wait'; value: number };

export interface RoverPose {
  x: number;
  y: number;
  heading: RoverHeading;
}

const HEADING_ORDER: RoverHeading[] = ['north', 'east', 'south', 'west'];

function rotateHeading(current: RoverHeading, direction: 'left' | 'right', degrees: number): RoverHeading {
  const currentIndex = HEADING_ORDER.indexOf(current);
  const steps = Math.floor(degrees / 90) % 4;

  let newIndex;
  if (direction === 'right') {
    newIndex = (currentIndex + steps) % 4;
  } else {
    newIndex = (currentIndex - steps + 4) % 4;
  }

  return HEADING_ORDER[newIndex];
}

function moveInDirection(x: number, y: number, heading: RoverHeading, distance: number): { x: number; y: number } {
  switch (heading) {
    case 'north':
      return { x, y: y - distance };
    case 'east':
      return { x: x + distance, y };
    case 'south':
      return { x, y: y + distance };
    case 'west':
      return { x: x - distance, y };
  }
}

export function applyRoverCommand(pose: RoverPose, command: RoverCommand): RoverPose {
  switch (command.type) {
    case 'forward': {
      const { x, y } = moveInDirection(pose.x, pose.y, pose.heading, command.value);
      return { ...pose, x, y };
    }
    case 'backward': {
      const { x, y } = moveInDirection(pose.x, pose.y, pose.heading, -command.value);
      return { ...pose, x, y };
    }
    case 'turn-left': {
      return { ...pose, heading: rotateHeading(pose.heading, 'left', command.value) };
    }
    case 'turn-right': {
      return { ...pose, heading: rotateHeading(pose.heading, 'right', command.value) };
    }
    case 'wait': {
      // Wait doesn't change position or heading
      return pose;
    }
  }
}
