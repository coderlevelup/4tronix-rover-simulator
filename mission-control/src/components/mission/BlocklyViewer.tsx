'use client';

import { useEffect, useRef, useState } from 'react';
import { defineRoverBlocks } from './roverBlockly';

/**
 * Read-only Blockly rendering of a saved workspace (mission.blocklyState).
 *
 * Loads Blockly from the same CDN as the editor and renders the program without
 * a toolbox, so learners can see the blocks they will remix. Pan/zoom stay on
 * (scrollbars + wheel) but editing is off. window.Blockly is typed by the
 * editor's global declaration.
 */
export function BlocklyViewer({ state }: { state: string }) {
  const divRef = useRef<HTMLDivElement>(null);
  const [loaded, setLoaded] = useState(false);
  const scriptLoadedRef = useRef(false);

  // Load Blockly from CDN (mirrors BlocklyEditor).
  useEffect(() => {
    if (typeof window === 'undefined' || scriptLoadedRef.current) return;
    if (window.Blockly) {
      scriptLoadedRef.current = true;
      setLoaded(true);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/blockly/blockly.min.js';
    script.async = true;
    script.onload = () => {
      scriptLoadedRef.current = true;
      setLoaded(true);
    };
    document.body.appendChild(script);
  }, []);

  useEffect(() => {
    if (!loaded || !divRef.current || !window.Blockly) return;

    const Blockly = window.Blockly;
    defineRoverBlocks(Blockly);

    const workspace = Blockly.inject(divRef.current, {
      readOnly: true,
      renderer: 'zelos',
      move: { drag: true, scrollbars: true, wheel: true },
      zoom: { controls: true, wheel: true, startScale: 0.7, maxScale: 2, minScale: 0.3 },
    });

    try {
      Blockly.serialization.workspaces.load(JSON.parse(state), workspace);
    } catch {
      // Ignore malformed state; an empty read-only canvas is an acceptable fallback.
    }

    requestAnimationFrame(() => Blockly.svgResize(workspace));

    return () => workspace.dispose();
  }, [loaded, state]);

  if (!loaded) {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
        Loading blocks...
      </div>
    );
  }

  return <div ref={divRef} className="h-full w-full" />;
}
