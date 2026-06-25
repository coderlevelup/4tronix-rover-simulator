'use client';

import { useEffect, useState, useRef } from 'react';
import Editor from '@monaco-editor/react';
import { type SimulationCommand } from './roverBlockly';
import { parseRoverCode } from '@/lib/parseRoverCode';

interface MonacoCodeEditorProps {
  onGenerateCommands: (commands: SimulationCommand[]) => void;
  onCodeChange?: (code: string) => void;
}

const DEFAULT_CODE = `# Write your rover code here
# Example: Simple movement
rover.forward(80, 1.5)
rover.spinRight(60, 1)
rover.forward(80, 1.5)
rover.stop()
`;

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
    const lines = codeToValidate.split('\n');

    const validCommands = [
      'rover.forward',
      'rover.reverse',
      'rover.spinLeft',
      'rover.spinRight',
      'rover.steerLeft',
      'rover.steerRight',
      'rover.stop',
    ];

    const dangerousPatterns = [
      { pattern: /\bimport\b/, message: 'Import statements are not allowed' },
      { pattern: /\bopen\(/, message: 'File operations are not allowed' },
      { pattern: /\beval\(/, message: 'eval() is not allowed' },
      { pattern: /\bexec\(/, message: 'exec() is not allowed' },
      { pattern: /\b__import__\b/, message: '__import__ is not allowed' },
      { pattern: /\bos\./, message: 'OS module is not allowed' },
      { pattern: /\bsys\./, message: 'sys module is not allowed' },
    ];

    lines.forEach((line, index) => {
      const trimmed = line.trim();

      // Skip comments and empty lines
      if (!trimmed || trimmed.startsWith('#')) return;

      // Check for dangerous patterns
      for (const { pattern, message } of dangerousPatterns) {
        if (pattern.test(line)) {
          errors.push({ line: index + 1, message });
          return;
        }
      }

      // Check if line contains rover command
      if (trimmed.includes('rover.')) {
        const hasValidCommand = validCommands.some(cmd => trimmed.includes(cmd));

        if (!hasValidCommand) {
          errors.push({
            line: index + 1,
            message: 'Invalid rover command. Use: forward, reverse, spinLeft, spinRight, steerLeft, steerRight, or stop'
          });
        }
      } else {
        // Line doesn't contain rover command - might be invalid Python
        errors.push({
          line: index + 1,
          message: 'Only rover commands are allowed. Start with "rover."'
        });
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

  const handleRun = () => {
    try {
      const commands = parseRoverCode(code);
      console.log('Generated commands from code:', commands);

      if (commands.length === 0) {
        setError('No valid rover commands found. Use rover.forward(), rover.spinRight(), etc.');
        return;
      }

      setError(null);
      onGenerateCommands(commands);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to parse code');
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <div className="flex items-center justify-between">
        <p className="text-xs text-slate-400">
          Write Python code using rover commands
        </p>
        <button
          onClick={handleRun}
          className="rounded-lg bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-500"
        >
          ▶ Run Code
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-900/50 bg-red-950/30 p-3 text-sm text-red-400">
          <strong>Error:</strong> {error}
        </div>
      )}

      {validationErrors.length > 0 && (
        <div className="rounded-lg border border-yellow-900/50 bg-yellow-950/30 p-3 text-sm text-yellow-400">
          <strong>Validation Issues ({validationErrors.length}):</strong>
          <ul className="mt-2 ml-4 list-disc space-y-1">
            {validationErrors.map((err, idx) => (
              <li key={idx}>
                Line {err.line}: {err.message}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="min-h-0 flex-1 rounded-lg border border-slate-700 overflow-hidden">
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
