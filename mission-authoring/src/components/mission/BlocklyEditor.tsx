'use client';

import { useEffect, useRef, useState } from 'react';

interface BlocklyEditorProps {
  onGenerateCommands: (commands: any[]) => void;
  onCodeChange?: (code: string) => void;
}

declare global {
  interface Window {
    Blockly: any;
  }
}

export function BlocklyEditor({ onGenerateCommands, onCodeChange }: BlocklyEditorProps) {
  const blocklyDivRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<any>(null);
  const [isInitialized, setIsInitialized] = useState(false);
  const [blocklyLoaded, setBlocklyLoaded] = useState(false);
  const scriptLoadedRef = useRef(false);

  // Load Blockly from CDN
  useEffect(() => {
    if (typeof window === 'undefined' || scriptLoadedRef.current) return;

    // Check if already loaded
    if (window.Blockly) {
      setBlocklyLoaded(true);
      scriptLoadedRef.current = true;
      return;
    }

    const script1 = document.createElement('script');
    script1.src = 'https://unpkg.com/blockly/blockly.min.js';
    script1.async = true;

    script1.onload = () => {
      scriptLoadedRef.current = true;
      setBlocklyLoaded(true);
      console.log('Blockly loaded from CDN');
    };

    document.body.appendChild(script1);

    return () => {
      // Don't remove script on unmount
    };
  }, []);

  useEffect(() => {
    if (!blocklyLoaded || !blocklyDivRef.current || !window.Blockly) return;
    if (workspaceRef.current) return; // Already initialized

    const timer = setTimeout(() => {
      if (!blocklyDivRef.current || !window.Blockly || workspaceRef.current) return;

      // Define blocks first
      defineCustomBlocks();

      // Create toolbox XML
      const toolboxXml = `
        <xml xmlns="https://developers.google.com/blockly/xml" id="toolbox" style="display: none">
          <category name="Movement" colour="#2196F3">
            <block type="rover_forward"></block>
            <block type="rover_backward"></block>
            <block type="rover_spin_left"></block>
            <block type="rover_spin_right"></block>
            <block type="rover_steer_left"></block>
            <block type="rover_steer_right"></block>
            <block type="rover_stop"></block>
          </category>
          <category name="Control" colour="#4CAF50">
            <block type="rover_repeat"></block>
          </category>
        </xml>
      `;

      // Initialize workspace
      const workspace = window.Blockly.inject(blocklyDivRef.current, {
        toolbox: toolboxXml,
        renderer: 'zelos',
        zoom: {
          controls: true,
          wheel: true,
          startScale: 0.8,
          maxScale: 2,
          minScale: 0.35,
          scaleSpeed: 1.15,
        },
        grid: {
          spacing: 20,
          length: 3,
          colour: '#ccc',
          snap: true,
        },
        trashcan: true,
        move: {
          drag: true,
          scrollbars: true,
          wheel: true,
        },
      });

      console.log('Blockly workspace created');
      console.log('Registered blocks:', Object.keys(window.Blockly.Blocks).filter((k: string) => k.startsWith('rover_')));

      workspaceRef.current = workspace;
      setIsInitialized(true);

      // Resize after paint so Blockly measures the final container dimensions.
      requestAnimationFrame(() => {
        window.Blockly.svgResize(workspace);
      });

      // Auto-save
      workspace.addChangeListener(() => {
        const xml = window.Blockly.Xml.workspaceToDom(workspace);
        const xmlText = window.Blockly.Xml.domToPrettyText(xml);
        localStorage.setItem('rover_blockly_workspace', xmlText);
      });

      // Load saved
      const saved = localStorage.getItem('rover_blockly_workspace');
      if (saved) {
        try {
          const xml = window.Blockly.utils.xml.textToDom(saved);
          window.Blockly.Xml.domToWorkspace(xml, workspace);
        } catch (e) {
          console.error('Failed to load saved workspace', e);
        }
      }
    }, 200);

    return () => {
      clearTimeout(timer);
    };
  }, [blocklyLoaded]);

  useEffect(() => {
    if (!isInitialized || !workspaceRef.current || !window.Blockly) return;

    const workspace = workspaceRef.current;
    const handleResize = () => {
      if (workspaceRef.current) {
        window.Blockly.svgResize(workspaceRef.current);
      }
    };

    window.addEventListener('resize', handleResize);

    let resizeObserver: ResizeObserver | null = null;
    if (containerRef.current && typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(handleResize);
      resizeObserver.observe(containerRef.current);
    }

    handleResize();

    return () => {
      window.removeEventListener('resize', handleResize);
      resizeObserver?.disconnect();

      if (workspaceRef.current === workspace) {
        workspace.dispose();
        workspaceRef.current = null;
        setIsInitialized(false);
      }
    };
  }, [isInitialized]);

  const handleRun = () => {
    if (!workspaceRef.current) return;

    const commands = blocksToCommands(workspaceRef.current);
    if (commands.length === 0) {
      alert('Add some blocks first!');
      return;
    }

    onGenerateCommands(commands);
  };

  // Generate Python code from blocks for submission
  const generatePythonCode = () => {
    if (!workspaceRef.current) return '';

    const commands = blocksToCommands(workspaceRef.current);
    const pythonLines = commands.map((cmd: any) => {
      switch (cmd.command) {
        case 'forward':
          return `rover.forward(${cmd.speed}, ${cmd.duration})`;
        case 'backward':
        case 'reverse':
          return `rover.reverse(${cmd.speed}, ${cmd.duration})`;
        case 'spinLeft':
          return `rover.spinLeft(${cmd.speed}, ${cmd.duration})`;
        case 'spinRight':
          return `rover.spinRight(${cmd.speed}, ${cmd.duration})`;
        case 'steerLeft':
          return `rover.steerLeft(${cmd.degrees}, ${cmd.speed}, ${cmd.duration})`;
        case 'steerRight':
          return `rover.steerRight(${cmd.degrees}, ${cmd.speed}, ${cmd.duration})`;
        case 'stop':
          return 'rover.stop()';
        default:
          return '';
      }
    });

    return pythonLines.filter(line => line).join('\n');
  };

  // Listen for workspace changes and update parent
  useEffect(() => {
    if (!workspaceRef.current || !onCodeChange) return;

    const workspace = workspaceRef.current;
    const listener = () => {
      const code = generatePythonCode();
      onCodeChange(code);
    };

    workspace.addChangeListener(listener);

    // Initial code generation
    listener();

    return () => {
      workspace.removeChangeListener(listener);
    };
  }, [isInitialized, onCodeChange]);

  if (!blocklyLoaded) {
    return (
      <div className="flex items-center justify-center p-8 text-slate-400">
        Loading Blockly...
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex h-full min-h-0 flex-col gap-3 overflow-hidden">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">
          Stack blocks, tune values, and launch a rover run.
        </p>
        <button
          onClick={handleRun}
          className="rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 px-3 py-1 text-xs font-medium text-white hover:from-emerald-500 hover:to-teal-500"
        >
          ▶ Run Blockly Code
        </button>
      </div>

      <div
        ref={blocklyDivRef}
        className="min-h-0 flex-1 rounded-lg border-2 border-slate-300 bg-white"
        style={{ width: '100%' }}
      />
    </div>
  );
}

function defineCustomBlocks() {
  if (!window.Blockly) return;

  // Forward
  window.Blockly.Blocks['rover_forward'] = {
    init: function () {
      this.appendDummyInput()
        .appendField('Move Forward')
        .appendField(new window.Blockly.FieldNumber(1.5, 0.1, 10, 0.1), 'DURATION')
        .appendField('seconds at speed')
        .appendField(new window.Blockly.FieldNumber(80, 0, 100, 10), 'SPEED');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour('#2196F3');
      this.setTooltip('Move forward');
    },
  };

  // Backward
  window.Blockly.Blocks['rover_backward'] = {
    init: function () {
      this.appendDummyInput()
        .appendField('Move Backward')
        .appendField(new window.Blockly.FieldNumber(1.5, 0.1, 10, 0.1), 'DURATION')
        .appendField('seconds at speed')
        .appendField(new window.Blockly.FieldNumber(80, 0, 100, 10), 'SPEED');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour('#2196F3');
      this.setTooltip('Move backward');
    },
  };

  // Spin Left
  window.Blockly.Blocks['rover_spin_left'] = {
    init: function () {
      this.appendDummyInput()
        .appendField('Spin Left')
        .appendField(new window.Blockly.FieldNumber(1, 0.1, 10, 0.1), 'DURATION')
        .appendField('seconds at speed')
        .appendField(new window.Blockly.FieldNumber(60, 0, 100, 10), 'SPEED');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour('#9C27B0');
      this.setTooltip('Spin left');
    },
  };

  // Spin Right
  window.Blockly.Blocks['rover_spin_right'] = {
    init: function () {
      this.appendDummyInput()
        .appendField('Spin Right')
        .appendField(new window.Blockly.FieldNumber(1, 0.1, 10, 0.1), 'DURATION')
        .appendField('seconds at speed')
        .appendField(new window.Blockly.FieldNumber(60, 0, 100, 10), 'SPEED');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour('#9C27B0');
      this.setTooltip('Spin right');
    },
  };

  // Steer Left
  window.Blockly.Blocks['rover_steer_left'] = {
    init: function () {
      this.appendDummyInput()
        .appendField('Steer Left')
        .appendField(new window.Blockly.FieldNumber(30, 5, 45, 5), 'DEGREES')
        .appendField('degrees for')
        .appendField(new window.Blockly.FieldNumber(1.5, 0.1, 10, 0.1), 'DURATION')
        .appendField('seconds at speed')
        .appendField(new window.Blockly.FieldNumber(60, 0, 100, 10), 'SPEED');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour('#03A9F4');
      this.setTooltip('Steer left');
    },
  };

  // Steer Right
  window.Blockly.Blocks['rover_steer_right'] = {
    init: function () {
      this.appendDummyInput()
        .appendField('Steer Right')
        .appendField(new window.Blockly.FieldNumber(30, 5, 45, 5), 'DEGREES')
        .appendField('degrees for')
        .appendField(new window.Blockly.FieldNumber(1.5, 0.1, 10, 0.1), 'DURATION')
        .appendField('seconds at speed')
        .appendField(new window.Blockly.FieldNumber(60, 0, 100, 10), 'SPEED');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour('#03A9F4');
      this.setTooltip('Steer right');
    },
  };

  // Stop
  window.Blockly.Blocks['rover_stop'] = {
    init: function () {
      this.appendDummyInput().appendField('Stop');
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour('#F44336');
      this.setTooltip('Stop');
    },
  };

  // Repeat
  window.Blockly.Blocks['rover_repeat'] = {
    init: function () {
      this.appendDummyInput()
        .appendField('Repeat')
        .appendField(new window.Blockly.FieldNumber(4, 1, 10, 1), 'TIMES')
        .appendField('times');
      this.appendStatementInput('DO').setCheck(null);
      this.setPreviousStatement(true, null);
      this.setNextStatement(true, null);
      this.setColour('#4CAF50');
      this.setTooltip('Repeat blocks');
    },
  };
}

function blocksToCommands(workspace: any): any[] {
  const commands: any[] = [];
  const topBlocks = workspace.getTopBlocks(false);

  for (const block of topBlocks) {
    processBlock(block, commands);
  }

  return commands;
}

function processBlock(block: any, commands: any[]): void {
  if (!block) return;

  const type = block.type;

  switch (type) {
    case 'rover_forward':
      commands.push({
        command: 'forward',
        speed: block.getFieldValue('SPEED'),
        duration: block.getFieldValue('DURATION'),
      });
      break;

    case 'rover_backward':
      commands.push({
        command: 'reverse',
        speed: block.getFieldValue('SPEED'),
        duration: block.getFieldValue('DURATION'),
      });
      break;

    case 'rover_spin_left':
      commands.push({
        command: 'spinLeft',
        speed: block.getFieldValue('SPEED'),
        duration: block.getFieldValue('DURATION'),
      });
      break;

    case 'rover_spin_right':
      commands.push({
        command: 'spinRight',
        speed: block.getFieldValue('SPEED'),
        duration: block.getFieldValue('DURATION'),
      });
      break;

    case 'rover_steer_left':
      commands.push({
        command: 'steerLeft',
        degrees: block.getFieldValue('DEGREES'),
        speed: block.getFieldValue('SPEED'),
        duration: block.getFieldValue('DURATION'),
      });
      break;

    case 'rover_steer_right':
      commands.push({
        command: 'steerRight',
        degrees: block.getFieldValue('DEGREES'),
        speed: block.getFieldValue('SPEED'),
        duration: block.getFieldValue('DURATION'),
      });
      break;

    case 'rover_stop':
      commands.push({ command: 'stop' });
      break;

    case 'rover_repeat':
      const times = block.getFieldValue('TIMES');
      const doBlock = block.getInputTargetBlock('DO');
      const loopCommands: any[] = [];
      if (doBlock) {
        processBlock(doBlock, loopCommands);
      }
      for (let i = 0; i < times; i++) {
        commands.push(...loopCommands);
      }
      break;
  }

  const nextBlock = block.getNextBlock();
  if (nextBlock) {
    processBlock(nextBlock, commands);
  }
}
