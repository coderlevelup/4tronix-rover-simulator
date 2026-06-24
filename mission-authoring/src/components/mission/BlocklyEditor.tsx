'use client';

import { useEffect, useRef, useState } from 'react';
import {
  defineRoverBlocks,
  ROVER_TOOLBOX,
  workspaceToPython,
  workspaceToCommands,
} from './roverBlockly';

interface BlocklyEditorProps {
  onGenerateCommands: (commands: any[]) => void;
  onCodeChange?: (code: string) => void;
}

declare global {
  interface Window {
    Blockly: any;
  }
}

// Hub-local storage of the serialized workspace. Separate origin from the yard,
// so the key name need not match - but the JSON format does (Blockly.serialization).
const STORAGE_KEY = 'roverWorkspace';

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

      const Blockly = window.Blockly;

      // Register the shared rover blocks (same defs the yard uses).
      defineRoverBlocks(Blockly);

      // Initialize workspace with the shared category toolbox.
      const workspace = Blockly.inject(blocklyDivRef.current, {
        toolbox: ROVER_TOOLBOX,
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

      workspaceRef.current = workspace;
      setIsInitialized(true);

      // Resize after paint so Blockly measures the final container dimensions.
      requestAnimationFrame(() => {
        Blockly.svgResize(workspace);
      });

      // Restore the saved workspace (JSON via Blockly.serialization), or start
      // with a fresh "On uplink" hat block - mirrors the yard's bootstrap.
      const startWithHat = () => {
        const block = workspace.newBlock('rover_on_receive');
        block.initSvg();
        block.render();
        block.moveBy(40, 40);
      };

      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          Blockly.serialization.workspaces.load(JSON.parse(saved), workspace);
        } catch (e) {
          console.warn('Failed to load saved workspace, starting fresh', e);
          workspace.clear();
          startWithHat();
        }
      } else {
        startWithHat();
      }

      // Auto-save serialized state on every change.
      workspace.addChangeListener(() => {
        try {
          const state = Blockly.serialization.workspaces.save(workspace);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        } catch {
          // Non-fatal - a transient change event during load can race; ignore.
        }
      });
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

    const commands = workspaceToCommands(workspaceRef.current);
    if (commands.length === 0) {
      alert('Add some movement blocks inside "On uplink" first!');
      return;
    }

    onGenerateCommands(commands);
  };

  // Listen for workspace changes and push generated Python up to the parent.
  useEffect(() => {
    if (!isInitialized || !workspaceRef.current || !onCodeChange) return;

    const workspace = workspaceRef.current;
    const listener = () => {
      onCodeChange(workspaceToPython(workspace));
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
          Stack blocks inside “On uplink”, tune values, and launch a rover run.
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
