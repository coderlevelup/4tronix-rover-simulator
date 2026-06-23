/**
 * Shared rover Blockly definitions, toolbox, and generators.
 *
 * These MUST stay compatible with the yard editor
 * (yard/satellite/templates/code.html): block type names, field names, and
 * dropdown option *values* are exactly what Blockly.serialization writes, so a
 * workspace saved in the hub loads in the yard with no unknown-block errors and
 * vice-versa. When you change a block here, mirror it there (and vice-versa).
 *
 * The Python generator mirrors the yard's so a learner's blocks produce the same
 * rover program the yard would run (low-level servo + time.sleep sequences).
 */

/* eslint-disable @typescript-eslint/no-explicit-any */

// Dropdown values are "R, G, B" strings consumed by the generator.
const LED_COLOURS: [string, string][] = [
  ['red', '255, 0, 0'],
  ['orange', '255, 96, 0'],
  ['yellow', '255, 200, 0'],
  ['green', '0, 255, 0'],
  ['blue', '0, 0, 255'],
  ['purple', '160, 0, 255'],
  ['pink', '255, 64, 160'],
  ['white', '255, 255, 255'],
  ['off', '0, 0, 0'],
];

// Pixel numbers from the 4tronix board layout.
const LED_POSITIONS: [string, string][] = [
  ['front left', '1'],
  ['front right', '2'],
  ['rear left', '0'],
  ['rear right', '3'],
];

/**
 * Register every rover block on the given Blockly instance.
 * Safe to call more than once (definitions are idempotent assignments).
 */
export function defineRoverBlocks(Blockly: any): void {
  Blockly.Blocks['rover_on_receive'] = {
    init: function () {
      this.appendDummyInput().appendField('🛰️ On uplink');
      this.appendStatementInput('DO').setCheck(null);
      this.setColour('#FF6D00');
      this.setTooltip('Blocks inside run when sent to the rover');
    },
  };

  Blockly.Blocks['rover_forward'] = {
    init: function () {
      this.appendDummyInput()
        .appendField('Move Forward')
        .appendField(new Blockly.FieldNumber(1, 0.1, 10, 0.1), 'TIME')
        .appendField('seconds');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour('#2196F3');
      this.setTooltip('Move the rover forward');
    },
  };

  Blockly.Blocks['rover_backward'] = {
    init: function () {
      this.appendDummyInput()
        .appendField('Move Backward')
        .appendField(new Blockly.FieldNumber(1, 0.1, 10, 0.1), 'TIME')
        .appendField('seconds');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour('#2196F3');
      this.setTooltip('Move the rover backward');
    },
  };

  Blockly.Blocks['rover_spin_left'] = {
    init: function () {
      this.appendDummyInput()
        .appendField('Spin Left')
        .appendField(new Blockly.FieldNumber(0.5, 0.1, 10, 0.1), 'TIME')
        .appendField('seconds');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour('#9C27B0');
      this.setTooltip('Spin the rover left in place');
    },
  };

  Blockly.Blocks['rover_spin_right'] = {
    init: function () {
      this.appendDummyInput()
        .appendField('Spin Right')
        .appendField(new Blockly.FieldNumber(0.5, 0.1, 10, 0.1), 'TIME')
        .appendField('seconds');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour('#9C27B0');
      this.setTooltip('Spin the rover right in place');
    },
  };

  Blockly.Blocks['rover_stop'] = {
    init: function () {
      this.appendDummyInput().appendField('Stop');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour('#f44336');
      this.setTooltip('Stop the rover immediately');
    },
  };

  Blockly.Blocks['rover_steer_left'] = {
    init: function () {
      this.appendDummyInput()
        .appendField('Steer Left')
        .appendField(new Blockly.FieldNumber(20, 5, 45, 5), 'DEGREES')
        .appendField('degrees for')
        .appendField(new Blockly.FieldNumber(1, 0.1, 10, 0.1), 'TIME')
        .appendField('seconds');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour('#00BCD4');
      this.setTooltip('Steer left while moving forward');
    },
  };

  Blockly.Blocks['rover_steer_right'] = {
    init: function () {
      this.appendDummyInput()
        .appendField('Steer Right')
        .appendField(new Blockly.FieldNumber(20, 5, 45, 5), 'DEGREES')
        .appendField('degrees for')
        .appendField(new Blockly.FieldNumber(1, 0.1, 10, 0.1), 'TIME')
        .appendField('seconds');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour('#00BCD4');
      this.setTooltip('Steer right while moving forward');
    },
  };

  Blockly.Blocks['rover_wait'] = {
    init: function () {
      this.appendDummyInput()
        .appendField('Wait')
        .appendField(new Blockly.FieldNumber(1, 0.1, 10, 0.1), 'TIME')
        .appendField('seconds');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour('#FF9800');
      this.setTooltip('Wait for specified time');
    },
  };

  Blockly.Blocks['rover_repeat'] = {
    init: function () {
      this.appendDummyInput()
        .appendField('Repeat')
        .appendField(new Blockly.FieldNumber(3, 1, 20, 1), 'TIMES')
        .appendField('times');
      this.appendStatementInput('DO').setCheck(null);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour('#FF9800');
      this.setTooltip('Repeat the blocks inside');
    },
  };

  Blockly.Blocks['rover_mast_turn'] = {
    init: function () {
      this.appendDummyInput()
        .appendField('Point Mast')
        .appendField(
          new Blockly.FieldDropdown([
            ['left', 'LEFT'],
            ['centre', 'CENTRE'],
            ['right', 'RIGHT'],
          ]),
          'DIR'
        )
        .appendField(new Blockly.FieldNumber(45, 5, 80, 5), 'DEGREES')
        .appendField('°');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour('#00897B');
      this.setTooltip('Turn the mast left or right, or point it straight ahead');
    },
  };

  Blockly.Blocks['rover_read_distance'] = {
    init: function () {
      this.appendDummyInput().appendField('Read Distance');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour('#00897B');
      this.setTooltip('Measure how far away the nearest thing is and show it on the monitor');
    },
  };

  Blockly.Blocks['rover_take_photo'] = {
    init: function () {
      this.appendDummyInput().appendField('Take a Picture');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour('#00897B');
      this.setTooltip('Take a photo with the mast camera and show it on the monitor');
    },
  };

  Blockly.Blocks['rover_distance'] = {
    init: function () {
      this.appendDummyInput().appendField('distance (cm)');
      this.setOutput(true, 'Number');
      this.setColour('#00897B');
      this.setTooltip('The distance the mast sensor sees — for use with comparisons');
    },
  };

  Blockly.Blocks['rover_leds_all'] = {
    init: function () {
      this.appendDummyInput()
        .appendField('Set all LEDs')
        .appendField(new Blockly.FieldDropdown(LED_COLOURS), 'COLOUR');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour('#673AB7');
      this.setTooltip('Set all four LEDs to a colour (driving blocks change them back)');
    },
  };

  Blockly.Blocks['rover_led_one'] = {
    init: function () {
      this.appendDummyInput()
        .appendField('Set')
        .appendField(new Blockly.FieldDropdown(LED_POSITIONS), 'LED')
        .appendField('LED')
        .appendField(new Blockly.FieldDropdown(LED_COLOURS), 'COLOUR');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour('#673AB7');
      this.setTooltip('Set one LED to a colour (driving blocks change them back)');
    },
  };
}

/** Category toolbox — mirrors the yard's. */
export const ROVER_TOOLBOX = {
  kind: 'categoryToolbox',
  contents: [
    {
      kind: 'category',
      name: '🛰️ Uplink',
      colour: '#FF6D00',
      contents: [{ kind: 'block', type: 'rover_on_receive' }],
    },
    {
      kind: 'category',
      name: 'Movement',
      colour: '#2196F3',
      contents: [
        { kind: 'block', type: 'rover_forward' },
        { kind: 'block', type: 'rover_backward' },
        { kind: 'block', type: 'rover_steer_left' },
        { kind: 'block', type: 'rover_steer_right' },
        { kind: 'block', type: 'rover_spin_left' },
        { kind: 'block', type: 'rover_spin_right' },
        { kind: 'block', type: 'rover_stop' },
      ],
    },
    {
      kind: 'category',
      name: 'Mast',
      colour: '#00897B',
      contents: [
        { kind: 'block', type: 'rover_mast_turn' },
        { kind: 'block', type: 'rover_read_distance' },
        { kind: 'block', type: 'rover_take_photo' },
        { kind: 'block', type: 'rover_distance' },
      ],
    },
    {
      kind: 'category',
      name: 'Lights',
      colour: '#673AB7',
      contents: [
        { kind: 'block', type: 'rover_leds_all' },
        { kind: 'block', type: 'rover_led_one' },
      ],
    },
    {
      kind: 'category',
      name: 'Control',
      colour: '#FF9800',
      contents: [
        { kind: 'block', type: 'rover_wait' },
        { kind: 'block', type: 'rover_repeat' },
      ],
    },
  ],
};

/**
 * Generate rover Python from the workspace. Only blocks inside an
 * `rover_on_receive` hat are emitted — matching the yard exactly.
 */
export function workspaceToPython(workspace: any): string {
  const lines: string[] = [];

  function blockToLines(block: any, indent: number): void {
    if (!block) return;
    const pad = '    '.repeat(indent);
    const type = block.type;

    switch (type) {
      case 'rover_on_receive': {
        blockToLines(block.getInputTargetBlock('DO'), indent);
        return; // hat block — no next block to follow
      }
      case 'rover_forward': {
        const t = block.getFieldValue('TIME');
        lines.push(`${pad}rover.setServo(9, 0)`);
        lines.push(`${pad}rover.setServo(11, 0)`);
        lines.push(`${pad}rover.setServo(13, 0)`);
        lines.push(`${pad}rover.setServo(15, 0)`);
        lines.push(`${pad}rover.forward(60)`);
        lines.push(`${pad}time.sleep(${t})`);
        lines.push(`${pad}rover.stop()`);
        break;
      }
      case 'rover_backward': {
        const t = block.getFieldValue('TIME');
        lines.push(`${pad}rover.setServo(9, 0)`);
        lines.push(`${pad}rover.setServo(11, 0)`);
        lines.push(`${pad}rover.setServo(13, 0)`);
        lines.push(`${pad}rover.setServo(15, 0)`);
        lines.push(`${pad}rover.reverse(60)`);
        lines.push(`${pad}time.sleep(${t})`);
        lines.push(`${pad}rover.stop()`);
        break;
      }
      case 'rover_spin_left': {
        const t = block.getFieldValue('TIME');
        lines.push(`${pad}rover.stop()`);
        lines.push(`${pad}rover.setServo(9, 50)`);
        lines.push(`${pad}rover.setServo(15, -50)`);
        lines.push(`${pad}rover.setServo(11, -50)`);
        lines.push(`${pad}rover.setServo(13, 50)`);
        lines.push(`${pad}rover.spinLeft(60)`);
        lines.push(`${pad}time.sleep(${t})`);
        lines.push(`${pad}rover.stop()`);
        break;
      }
      case 'rover_spin_right': {
        const t = block.getFieldValue('TIME');
        lines.push(`${pad}rover.stop()`);
        lines.push(`${pad}rover.setServo(9, 50)`);
        lines.push(`${pad}rover.setServo(15, -50)`);
        lines.push(`${pad}rover.setServo(11, -50)`);
        lines.push(`${pad}rover.setServo(13, 50)`);
        lines.push(`${pad}rover.spinRight(60)`);
        lines.push(`${pad}time.sleep(${t})`);
        lines.push(`${pad}rover.stop()`);
        break;
      }
      case 'rover_stop':
        lines.push(`${pad}rover.stop()`);
        break;
      case 'rover_steer_left': {
        const d = block.getFieldValue('DEGREES');
        const t = block.getFieldValue('TIME');
        lines.push(`${pad}rover.setServo(9, -${d})`);
        lines.push(`${pad}rover.setServo(15, -${d})`);
        lines.push(`${pad}rover.setServo(11, ${d})`);
        lines.push(`${pad}rover.setServo(13, ${d})`);
        lines.push(`${pad}rover.forward(60)`);
        lines.push(`${pad}time.sleep(${t})`);
        lines.push(`${pad}rover.stop()`);
        lines.push(`${pad}rover.setServo(9, 0)`);
        lines.push(`${pad}rover.setServo(11, 0)`);
        lines.push(`${pad}rover.setServo(13, 0)`);
        lines.push(`${pad}rover.setServo(15, 0)`);
        break;
      }
      case 'rover_steer_right': {
        const d = block.getFieldValue('DEGREES');
        const t = block.getFieldValue('TIME');
        lines.push(`${pad}rover.setServo(9, ${d})`);
        lines.push(`${pad}rover.setServo(15, ${d})`);
        lines.push(`${pad}rover.setServo(11, -${d})`);
        lines.push(`${pad}rover.setServo(13, -${d})`);
        lines.push(`${pad}rover.forward(60)`);
        lines.push(`${pad}time.sleep(${t})`);
        lines.push(`${pad}rover.stop()`);
        lines.push(`${pad}rover.setServo(9, 0)`);
        lines.push(`${pad}rover.setServo(11, 0)`);
        lines.push(`${pad}rover.setServo(13, 0)`);
        lines.push(`${pad}rover.setServo(15, 0)`);
        break;
      }
      case 'rover_wait': {
        const t = block.getFieldValue('TIME');
        lines.push(`${pad}time.sleep(${t})`);
        break;
      }
      case 'rover_mast_turn': {
        // Mast servo is 0; positive degrees = left, negative = right
        const dir = block.getFieldValue('DIR');
        const deg = block.getFieldValue('DEGREES');
        const angle = dir === 'LEFT' ? deg : dir === 'RIGHT' ? -deg : 0;
        lines.push(`${pad}rover.setServo(0, ${angle})`);
        lines.push(`${pad}time.sleep(0.5)`);
        break;
      }
      case 'rover_read_distance': {
        lines.push(`${pad}print('Distance: ' + str(round(rover.getDistance())) + ' cm')`);
        break;
      }
      case 'rover_take_photo': {
        lines.push(`${pad}take_photo()`);
        break;
      }
      case 'rover_leds_all': {
        const rgb = block.getFieldValue('COLOUR');
        lines.push(`${pad}rover.setColor(rover.fromRGB(${rgb}))`);
        lines.push(`${pad}rover.show()`);
        break;
      }
      case 'rover_led_one': {
        const led = block.getFieldValue('LED');
        const rgb = block.getFieldValue('COLOUR');
        lines.push(`${pad}rover.setPixel(${led}, rover.fromRGB(${rgb}))`);
        lines.push(`${pad}rover.show()`);
        break;
      }
      case 'rover_repeat': {
        const times = block.getFieldValue('TIMES');
        lines.push(`${pad}for _ in range(${times}):`);
        const inner = block.getInputTargetBlock('DO');
        if (inner) {
          blockToLines(inner, indent + 1);
        } else {
          lines.push(`${pad}    pass`);
        }
        break;
      }
    }

    blockToLines(block.getNextBlock(), indent);
  }

  workspace
    .getTopBlocks(true)
    .filter((b: any) => b.type === 'rover_on_receive')
    .forEach((b: any) => blockToLines(b, 0));

  return lines.join('\n') + '\n';
}

export interface SimulationCommand {
  command: string;
  speed?: number;
  duration?: number;
  degrees?: number;
}

/**
 * Map the workspace to local-simulator commands (movement only — the 2D sim
 * has no concept of mast/LED/photo/wait). Speed is fixed at 60 to match the
 * Python the rover actually runs. Only blocks inside `rover_on_receive` count.
 */
export function workspaceToCommands(workspace: any): SimulationCommand[] {
  const commands: SimulationCommand[] = [];

  function processChain(block: any, out: SimulationCommand[]): void {
    while (block) {
      processOne(block, out);
      block = block.getNextBlock();
    }
  }

  function processOne(block: any, out: SimulationCommand[]): void {
    switch (block.type) {
      case 'rover_on_receive':
        processChain(block.getInputTargetBlock('DO'), out);
        break;
      case 'rover_forward':
        out.push({ command: 'forward', speed: 60, duration: Number(block.getFieldValue('TIME')) });
        break;
      case 'rover_backward':
        out.push({ command: 'reverse', speed: 60, duration: Number(block.getFieldValue('TIME')) });
        break;
      case 'rover_spin_left':
        out.push({ command: 'spinLeft', speed: 60, duration: Number(block.getFieldValue('TIME')) });
        break;
      case 'rover_spin_right':
        out.push({ command: 'spinRight', speed: 60, duration: Number(block.getFieldValue('TIME')) });
        break;
      case 'rover_steer_left':
        out.push({
          command: 'steerLeft',
          degrees: Number(block.getFieldValue('DEGREES')),
          speed: 60,
          duration: Number(block.getFieldValue('TIME')),
        });
        break;
      case 'rover_steer_right':
        out.push({
          command: 'steerRight',
          degrees: Number(block.getFieldValue('DEGREES')),
          speed: 60,
          duration: Number(block.getFieldValue('TIME')),
        });
        break;
      case 'rover_stop':
        out.push({ command: 'stop' });
        break;
      case 'rover_repeat': {
        const times = Number(block.getFieldValue('TIMES'));
        const loop: SimulationCommand[] = [];
        processChain(block.getInputTargetBlock('DO'), loop);
        for (let i = 0; i < times; i++) out.push(...loop);
        break;
      }
      // mast / LEDs / photo / wait / distance have no 2D-sim effect
      default:
        break;
    }
  }

  workspace
    .getTopBlocks(true)
    .filter((b: any) => b.type === 'rover_on_receive')
    .forEach((b: any) => processOne(b, commands));

  return commands;
}
