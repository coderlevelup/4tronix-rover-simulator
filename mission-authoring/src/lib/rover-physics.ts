/**
 * Client-side rover physics engine for real-time manual control
 * Based on roversimui.py Rover class
 */

const FULL_SPEED_CM_PER_SECOND = 10;
const VEHICLE_WIDTH_CM = 16;
const DISTANCE_BETWEEN_WHEEL_PAIRS_CM = 8;

const SERVO_FL = 9;
const SERVO_FR = 15;
const SERVO_RL = 11;
const SERVO_RR = 13;

export interface RoverState {
  x: number;
  y: number;
  heading: number;
  speedL: number;
  speedR: number;
  servos: number[];
}

export class RoverPhysics {
  private state: RoverState;
  private lastUpdate: number;

  constructor() {
    this.state = {
      x: 0,
      y: 0,
      heading: 0,
      speedL: 0,
      speedR: 0,
      servos: new Array(16).fill(0),
    };
    this.lastUpdate = Date.now();
  }

  setCommand(command: string, speed: number = 80) {
    switch (command) {
      case 'forward':
        this.state.servos[SERVO_FL] = 0;
        this.state.servos[SERVO_FR] = 0;
        this.state.servos[SERVO_RL] = 0;
        this.state.servos[SERVO_RR] = 0;
        this.state.speedL = speed;
        this.state.speedR = speed;
        break;

      case 'reverse':
        this.state.servos[SERVO_FL] = 0;
        this.state.servos[SERVO_FR] = 0;
        this.state.servos[SERVO_RL] = 0;
        this.state.servos[SERVO_RR] = 0;
        this.state.speedL = -speed;
        this.state.speedR = -speed;
        break;

      case 'spinLeft':
        this.state.servos[SERVO_FL] = 50;
        this.state.servos[SERVO_FR] = -50;
        this.state.servos[SERVO_RL] = -50;
        this.state.servos[SERVO_RR] = 50;
        this.state.speedL = -speed;
        this.state.speedR = speed;
        break;

      case 'spinRight':
        this.state.servos[SERVO_FL] = 50;
        this.state.servos[SERVO_FR] = -50;
        this.state.servos[SERVO_RL] = -50;
        this.state.servos[SERVO_RR] = 50;
        this.state.speedL = speed;
        this.state.speedR = -speed;
        break;

      case 'steerLeft':
        this.state.servos[SERVO_FL] = -30;
        this.state.servos[SERVO_FR] = -30;
        this.state.servos[SERVO_RL] = 30;
        this.state.servos[SERVO_RR] = 30;
        this.state.speedL = speed;
        this.state.speedR = speed;
        break;

      case 'steerRight':
        this.state.servos[SERVO_FL] = 30;
        this.state.servos[SERVO_FR] = 30;
        this.state.servos[SERVO_RL] = -30;
        this.state.servos[SERVO_RR] = -30;
        this.state.speedL = speed;
        this.state.speedR = speed;
        break;

      case 'stop':
        this.state.speedL = 0;
        this.state.speedR = 0;
        this.state.servos[SERVO_FL] = 0;
        this.state.servos[SERVO_FR] = 0;
        this.state.servos[SERVO_RL] = 0;
        this.state.servos[SERVO_RR] = 0;
        break;
    }
  }

  update(): RoverState {
    const currentTime = Date.now();
    const dt = (currentTime - this.lastUpdate) / 1000; // Convert to seconds
    this.lastUpdate = currentTime;

    // Calculate new position based on current speeds and servo angles
    const calculateSteeredPosition = (
      left: boolean,
      wheelAngleDegrees: number,
      wheelSpeed: number,
      dt: number
    ): [number, number, number] => {
      const wheelSpeedCmPerSecond = (wheelSpeed / 100.0) * FULL_SPEED_CM_PER_SECOND;

      if (wheelAngleDegrees === 0) {
        const headingInRadians = (this.state.heading / 180.0) * Math.PI;
        const distanceMovedCm = wheelSpeedCmPerSecond * dt;
        const xChangeCm = distanceMovedCm * Math.sin(headingInRadians);
        const yChangeCm = distanceMovedCm * Math.cos(headingInRadians);
        return [this.state.x + xChangeCm, this.state.y + yChangeCm, this.state.heading];
      } else {
        const wheelDistanceFromCentreX = VEHICLE_WIDTH_CM / 2;
        const steerablePosRelativeToRoverX = left ? -wheelDistanceFromCentreX : wheelDistanceFromCentreX;
        const distanceBetweenWheelsCm = DISTANCE_BETWEEN_WHEEL_PAIRS_CM;

        const wheelAngleRadians = (wheelAngleDegrees / 180.0) * Math.PI;
        const turningRadiusToSteerableWheelCm = distanceBetweenWheelsCm / Math.sin(wheelAngleRadians);
        const circumferenceCm = 2 * Math.PI * turningRadiusToSteerableWheelCm;

        const revolutionsPerSecond = wheelSpeedCmPerSecond / circumferenceCm;
        const revolutionsTurned = revolutionsPerSecond * dt;
        const headingChangeDegrees = revolutionsTurned * 360;
        const headingChangeRadians = revolutionsTurned * 2 * Math.PI;

        const turningCircleCentreDistance =
          Math.cos(wheelAngleRadians) * turningRadiusToSteerableWheelCm - steerablePosRelativeToRoverX;
        const vehicleHeadingRadians = (this.state.heading * Math.PI) / 180;
        const turningCircleRelativeX = turningCircleCentreDistance * Math.cos(-vehicleHeadingRadians);
        const turningCircleRelativeY = turningCircleCentreDistance * Math.sin(-vehicleHeadingRadians);
        const turningCircleX = turningCircleRelativeX + this.state.x;
        const turningCircleY = turningCircleRelativeY + this.state.y;

        const currentAngleRadians = Math.atan2(this.state.y - turningCircleY, this.state.x - turningCircleX);
        const updatedAngleRadians = currentAngleRadians - headingChangeRadians;
        const updatedVehicleX = turningCircleX + Math.abs(turningCircleCentreDistance) * Math.cos(updatedAngleRadians);
        const updatedVehicleY = turningCircleY + Math.abs(turningCircleCentreDistance) * Math.sin(updatedAngleRadians);

        return [updatedVehicleX, updatedVehicleY, this.state.heading + headingChangeDegrees];
      }
    };

    // Calculate for all four wheels (using servo_FL bug like original)
    const [xFL, yFL, hFL] = calculateSteeredPosition(true, this.state.servos[SERVO_FL], this.state.speedL, dt);
    const [xFR, yFR, hFR] = calculateSteeredPosition(false, this.state.servos[SERVO_FL], this.state.speedL, dt);
    const [xBL, yBL, hBL] = calculateSteeredPosition(true, this.state.servos[SERVO_FL], this.state.speedL, dt);
    const [xBR, yBR, hBR] = calculateSteeredPosition(false, this.state.servos[SERVO_FL], this.state.speedL, dt);

    // Average the results
    this.state.x = (xFL + xFR + xBL + xBR) / 4;
    this.state.y = (yFL + yFR + yBL + yBR) / 4;
    this.state.heading = (hFL + hFR + hBL + hBR) / 4;

    return { ...this.state };
  }

  getState(): RoverState {
    return { ...this.state };
  }

  reset() {
    this.state = {
      x: 0,
      y: 0,
      heading: 0,
      speedL: 0,
      speedR: 0,
      servos: new Array(16).fill(0),
    };
    this.lastUpdate = Date.now();
  }
}
