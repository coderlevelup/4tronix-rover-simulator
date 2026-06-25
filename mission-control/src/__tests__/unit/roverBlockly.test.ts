/**
 * Unit tests for the shared rover Blockly generators (AB#254).
 *
 * Validates that workspaceToPython emits the same low-level rover program the
 * yard runs, and that workspaceToCommands maps movement blocks for the local
 * simulator. Uses lightweight mock blocks so no browser/Blockly is required.
 */

import { workspaceToPython, workspaceToCommands } from '@/components/mission/roverBlockly';

type Fields = Record<string, string | number>;

interface MockBlock {
  type: string;
  _next: MockBlock | null;
  getFieldValue(name: string): string | number | undefined;
  getInputTargetBlock(name: string): MockBlock | null;
  getNextBlock(): MockBlock | null;
}

function block(type: string, fields: Fields = {}, inputs: Record<string, MockBlock> = {}): MockBlock {
  const b: MockBlock = {
    type,
    _next: null,
    getFieldValue: (n) => fields[n],
    getInputTargetBlock: (n) => inputs[n] ?? null,
    getNextBlock: () => b._next,
  };
  return b;
}

/** Link blocks into a next-chain and return the head. */
function chain(...blocks: MockBlock[]): MockBlock {
  for (let i = 0; i < blocks.length - 1; i++) blocks[i]._next = blocks[i + 1];
  return blocks[0];
}

function workspace(...top: MockBlock[]): { getTopBlocks: () => MockBlock[] } {
  return { getTopBlocks: () => top };
}

function onReceive(body: MockBlock): MockBlock {
  return block('rover_on_receive', {}, { DO: body });
}

describe('workspaceToPython', () => {
  it('emits the rover servo + forward + sleep + stop sequence', () => {
    const ws = workspace(onReceive(block('rover_forward', { TIME: 2 })));
    expect(workspaceToPython(ws)).toBe(
      [
        'rover.setServo(9, 0)',
        'rover.setServo(11, 0)',
        'rover.setServo(13, 0)',
        'rover.setServo(15, 0)',
        'rover.forward(60)',
        'time.sleep(2)',
        'rover.stop()',
      ].join('\n') + '\n'
    );
  });

  it('indents a repeat loop body with range()', () => {
    const ws = workspace(
      onReceive(block('rover_repeat', { TIMES: 3 }, { DO: block('rover_stop') }))
    );
    expect(workspaceToPython(ws)).toBe(
      ['for _ in range(3):', '    rover.stop()'].join('\n') + '\n'
    );
  });

  it('emits mast/LED/photo actions', () => {
    const ws = workspace(
      onReceive(
        chain(
          block('rover_leds_all', { COLOUR: '255, 0, 0' }),
          block('rover_take_photo'),
          block('rover_read_distance')
        )
      )
    );
    expect(workspaceToPython(ws)).toBe(
      [
        'rover.setColor(rover.fromRGB(255, 0, 0))',
        'rover.show()',
        'take_photo()',
        "print('Distance: ' + str(round(rover.getDistance())) + ' cm')",
      ].join('\n') + '\n'
    );
  });

  it('only generates code inside an On uplink hat (loose blocks ignored)', () => {
    const ws = workspace(block('rover_forward', { TIME: 1 })); // not inside on_receive
    expect(workspaceToPython(ws)).toBe('\n');
  });
});

describe('workspaceToCommands', () => {
  it('maps movement blocks to simulator commands at fixed speed 60', () => {
    const ws = workspace(
      onReceive(
        chain(
          block('rover_forward', { TIME: 2 }),
          block('rover_steer_left', { DEGREES: 20, TIME: 1 }),
          block('rover_take_photo') // non-movement → skipped
        )
      )
    );
    expect(workspaceToCommands(ws)).toEqual([
      { command: 'forward', speed: 60, duration: 2 },
      { command: 'steerLeft', degrees: 20, speed: 60, duration: 1 },
    ]);
  });

  it('expands repeat loops', () => {
    const ws = workspace(
      onReceive(block('rover_repeat', { TIMES: 2 }, { DO: block('rover_stop') }))
    );
    expect(workspaceToCommands(ws)).toEqual([{ command: 'stop' }, { command: 'stop' }]);
  });
});
