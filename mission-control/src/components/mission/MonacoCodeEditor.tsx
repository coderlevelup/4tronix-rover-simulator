'use client';

import { useEffect, useState, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { Play, AlertTriangle } from 'lucide-react';
import { type SimulationCommand } from './roverBlockly';
import { parseRoverCode } from '@/lib/parseRoverCode';

interface MonacoCodeEditorProps {
  onGenerateCommands: (commands: SimulationCommand[]) => void;
  onCodeChange?: (code: string) => void;
}

// The real rover API: speed is 0-100, and you control how long a move lasts
// with time.sleep() then rover.stop() - exactly what the blocks generate.
const DEFAULT_CODE = `# Drive your rover. Speed is 0-100, time is in seconds.
rover.forward(60)
time.sleep(1.5)
rover.stop()

rover.spinRight(60)
time.sleep(0.5)
rover.stop()

rover.forward(60)
time.sleep(1.5)
rover.stop()
`;

// Snippets the palette inserts. Colours echo the Blockly categories so the
// Python tab reads as "the same blocks, written out".
const SNIPPETS: { label: string; colour: string; code: string }[] = [
  { label: 'Forward', colour: '#2196F3', code: 'rover.forward(60)\ntime.sleep(1)\nrover.stop()\n' },
  { label: 'Backward', colour: '#2196F3', code: 'rover.reverse(60)\ntime.sleep(1)\nrover.stop()\n' },
  { label: 'Spin left', colour: '#9C27B0', code: 'rover.spinLeft(60)\ntime.sleep(0.5)\nrover.stop()\n' },
  { label: 'Spin right', colour: '#9C27B0', code: 'rover.spinRight(60)\ntime.sleep(0.5)\nrover.stop()\n' },
  {
    label: 'Steer left',
    colour: '#00BCD4',
    code:
      'rover.setServo(9, -20)\nrover.setServo(15, -20)\nrover.setServo(11, 20)\nrover.setServo(13, 20)\n' +
      'rover.forward(60)\ntime.sleep(1)\nrover.stop()\n' +
      'rover.setServo(9, 0)\nrover.setServo(11, 0)\nrover.setServo(13, 0)\nrover.setServo(15, 0)\n',
  },
  {
    label: 'Steer right',
    colour: '#00BCD4',
    code:
      'rover.setServo(9, 20)\nrover.setServo(15, 20)\nrover.setServo(11, -20)\nrover.setServo(13, -20)\n' +
      'rover.forward(60)\ntime.sleep(1)\nrover.stop()\n' +
      'rover.setServo(9, 0)\nrover.setServo(11, 0)\nrover.setServo(13, 0)\nrover.setServo(15, 0)\n',
  },
  { label: 'Stop', colour: '#f44336', code: 'rover.stop()\n' },
  { label: 'Wait', colour: '#FF9800', code: 'time.sleep(1)\n' },
  { label: 'Repeat', colour: '#FF9800', code: 'for _ in range(3):\n    rover.forward(60)\n    time.sleep(1)\n    rover.stop()\n' },
  { label: 'Lights', colour: '#673AB7', code: 'rover.setColor(rover.fromRGB(255, 0, 0))\nrover.show()\n' },
];

export function MonacoCodeEditor({ onGenerateCommands, onCodeChange }: MonacoCodeEditorProps) {
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [validationErrors, setValidationErrors] = useState<Array<{ line: number; message: string }>>([]);
  // Monaco editor + namespace instances (provided untyped by the editor lib).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const editorRef = useRef<any>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const monacoRef = useRef<any>(null);

  useEffect(() => {
    // Load saved code from localStorage
    const saved = localStorage.getItem('rover_monaco_code');
    const initialCode = saved || DEFAULT_CODE;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time hydration of editor contents from localStorage
    setCode(initialCode);

    if (onCodeChange) {
      onCodeChange(initialCode);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- run once on mount to hydrate from storage
  }, []);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Monaco editor/namespace instances from @monaco-editor/react onMount
  const handleEditorDidMount = (editor: any, monaco: any) => {
    editorRef.current = editor;
    monacoRef.current = monaco;

    // Validate on mount
    validateCode(code);
  };

  const validateCode = (codeToValidate: string) => {
    const errors: Array<{ line: number; message: string }> = [];

    // Only flag genuinely unsafe lines (mirrors the server-side allowlist).
    // Real rover code uses time.sleep(), for-loops, print() and rover.setServo()
    // alongside the movement calls, so we do not require every line to be a
    // rover command.
    const dangerousPatterns = [
      { pattern: /\bimport\b/, message: 'Import statements are not allowed' },
      { pattern: /\bopen\(/, message: 'File operations are not allowed' },
      { pattern: /\beval\(/, message: 'eval() is not allowed' },
      { pattern: /\bexec\(/, message: 'exec() is not allowed' },
      { pattern: /\b__import__\b/, message: '__import__ is not allowed' },
      { pattern: /\bos\./, message: 'The os module is not allowed' },
      { pattern: /\bsys\./, message: 'The sys module is not allowed' },
    ];

    codeToValidate.split('\n').forEach((line, index) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) return;
      for (const { pattern, message } of dangerousPatterns) {
        if (pattern.test(line)) {
          errors.push({ line: index + 1, message });
          return;
        }
      }
    });

    setValidationErrors(errors);

    // Update Monaco editor markers
    if (editorRef.current && monacoRef.current) {
      const model = editorRef.current.getModel();
      if (model) {
        const markers = errors.map(err => ({
          startLineNumber: err.line,
          startColumn: 1,
          endLineNumber: err.line,
          endColumn: model.getLineMaxColumn(err.line),
          message: err.message,
          severity: monacoRef.current.MarkerSeverity.Error,
        }));
        monacoRef.current.editor.setModelMarkers(model, 'rover-validator', markers);
      }
    }
  };

  const handleCodeChange = (value: string | undefined) => {
    const newCode = value || '';
    setCode(newCode);
    localStorage.setItem('rover_monaco_code', newCode);
    setError(null);

    // Validate code in real-time
    validateCode(newCode);

    // Notify parent of code change
    if (onCodeChange) {
      onCodeChange(newCode);
    }
  };

  const insertSnippet = (snippet: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    const selection = editor.getSelection();
    editor.executeEdits('palette', [{ range: selection, text: snippet, forceMoveMarkers: true }]);
    editor.focus();
  };

  const handleRun = () => {
    try {
      const commands = parseRoverCode(code);

      if (commands.length === 0) {
        setError('No rover moves found yet. Try a move, then time.sleep() for how long, then rover.stop().');
        return;
      }

      setError(null);
      onGenerateCommands(commands);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse code');
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-2.5 overflow-hidden">
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 text-xs text-muted-foreground">
          Write Python using rover commands.
        </p>
        <button
          onClick={handleRun}
          className="clay clay-press flex shrink-0 items-center gap-1.5 rounded-xl bg-buzz px-3.5 py-2 text-xs font-bold text-background"
        >
          <Play className="h-3.5 w-3.5" fill="currentColor" />
          Run code
        </button>
      </div>

      {/* Insert-on-click command palette (doubles as the cheat sheet). Tap a
          chip to drop the real rover code at the cursor. */}
      <div className="flex flex-wrap items-center gap-1.5">
        {SNIPPETS.map((item) => (
          <button
            key={item.label}
            onClick={() => insertSnippet(item.code)}
            title={`Insert ${item.label} code`}
            className="clay-press inline-flex items-center gap-1.5 rounded-lg border border-border/60 bg-card/50 px-2.5 py-1 text-xs font-semibold text-foreground transition-colors hover:border-primary"
          >
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: item.colour }} />
            {item.label}
          </button>
        ))}
      </div>

      {error && (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-2.5 text-xs text-destructive">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p><strong>Error:</strong> {error}</p>
        </div>
      )}

      {validationErrors.length > 0 && (
        <div className="rounded-xl border border-block-hat/30 bg-block-hat/10 p-2.5 text-xs text-block-hat">
          <p className="flex items-center gap-1.5 font-semibold">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {validationErrors.length} thing{validationErrors.length === 1 ? '' : 's'} to fix
          </p>
          <ul className="ml-5 mt-1.5 list-disc space-y-1">
            {validationErrors.map((err, idx) => (
              <li key={idx}>
                Line {err.line}: {err.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="min-h-0 flex-1 overflow-hidden rounded-xl border border-border">
        <Editor
          height="100%"
          defaultLanguage="python"
          value={code}
          onChange={handleCodeChange}
          onMount={handleEditorDidMount}
          theme="vs-dark"
          options={{
            minimap: { enabled: false },
            fontSize: 14,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            automaticLayout: true,
            tabSize: 4,
            wordWrap: 'on',
          }}
        />
      </div>
    </div>
  );
}

// parseRoverCode lives in @/lib/parseRoverCode so the mission detail page can
// re-simulate a stored mission from its code too.
