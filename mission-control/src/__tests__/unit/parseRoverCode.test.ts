import { parseRoverCode } from '@/lib/parseRoverCode';

describe('parseRoverCode', () => {
  describe('real low-level rover API (blocks + real rover)', () => {
    it('reads forward(speed) + time.sleep + stop as one forward command', () => {
      const code = ['rover.forward(60)', 'time.sleep(1.5)', 'rover.stop()'].join('\n');
      expect(parseRoverCode(code)).toEqual([{ command: 'forward', speed: 60, duration: 1.5 }]);
    });

    it('reads reverse and spins', () => {
      const code = [
        'rover.reverse(80)',
        'time.sleep(1)',
        'rover.stop()',
        'rover.spinLeft(60)',
        'time.sleep(0.5)',
        'rover.stop()',
      ].join('\n');
      expect(parseRoverCode(code)).toEqual([
        { command: 'reverse', speed: 80, duration: 1 },
        { command: 'spinLeft', speed: 60, duration: 0.5 },
      ]);
    });

    it('reads a steered move from the wheel servos (front-left negative = steer left)', () => {
      const code = [
        'rover.setServo(9, -20)',
        'rover.setServo(15, -20)',
        'rover.setServo(11, 20)',
        'rover.setServo(13, 20)',
        'rover.forward(60)',
        'time.sleep(1)',
        'rover.stop()',
      ].join('\n');
      expect(parseRoverCode(code)).toEqual([
        { command: 'steerLeft', degrees: 20, speed: 60, duration: 1 },
      ]);
    });

    it('reads steer right (front-left positive)', () => {
      const code = [
        'rover.setServo(9, 30)',
        'rover.forward(60)',
        'time.sleep(2)',
        'rover.stop()',
      ].join('\n');
      expect(parseRoverCode(code)).toEqual([
        { command: 'steerRight', degrees: 30, speed: 60, duration: 2 },
      ]);
    });

    it('straightens between moves so a later forward is not a steer', () => {
      const code = [
        'rover.setServo(9, -20)',
        'rover.forward(60)',
        'time.sleep(1)',
        'rover.stop()',
        'rover.setServo(9, 0)',
        'rover.forward(60)',
        'time.sleep(1)',
        'rover.stop()',
      ].join('\n');
      const out = parseRoverCode(code);
      expect(out[0].command).toBe('steerLeft');
      expect(out[1]).toEqual({ command: 'forward', speed: 60, duration: 1 });
    });

    it('ignores LEDs, mast and a bare wait (no movement)', () => {
      const code = [
        'rover.setColor(rover.fromRGB(255, 0, 0))',
        'rover.show()',
        'time.sleep(1)', // bare wait, no active motion
        'rover.forward(60)',
        'time.sleep(1)',
        'rover.stop()',
      ].join('\n');
      expect(parseRoverCode(code)).toEqual([{ command: 'forward', speed: 60, duration: 1 }]);
    });
  });

  describe('for-loops', () => {
    it('expands range loops, repeating the body', () => {
      const code = [
        'for _ in range(3):',
        '    rover.forward(60)',
        '    time.sleep(1)',
        '    rover.stop()',
      ].join('\n');
      const out = parseRoverCode(code);
      expect(out).toHaveLength(3);
      expect(out.every((c) => c.command === 'forward')).toBe(true);
    });
  });

  describe('legacy high-level form still replays', () => {
    it('reads forward(speed, duration)', () => {
      expect(parseRoverCode('rover.forward(80, 1.5)')).toEqual([
        { command: 'forward', speed: 80, duration: 1.5 },
      ]);
    });

    it('reads steerLeft(degrees, speed, duration)', () => {
      expect(parseRoverCode('rover.steerLeft(20, 60, 1)')).toEqual([
        { command: 'steerLeft', degrees: 20, speed: 60, duration: 1 },
      ]);
    });
  });

  it('skips comments and blank lines', () => {
    const code = ['# drive forward', '', 'rover.forward(60)', 'time.sleep(1)'].join('\n');
    expect(parseRoverCode(code)).toEqual([{ command: 'forward', speed: 60, duration: 1 }]);
  });
});
