import type { TrajectoryPoint } from './simulateCommands';
import { computeLayout, drawSimFrame, SIM_FPS } from './roverSimRender';

// 4:3 to match the yard; large enough for a crisp shareable clip.
const CANVAS_W = 800;
const CANVAS_H = 600;

/**
 * Render a trajectory to a short video (Blob) entirely in the browser: draw each
 * frame to an offscreen canvas and capture it with MediaRecorder. Rejects if the
 * browser cannot capture canvas streams so callers can fall back to the live
 * animation. Uses the shared draw routine (roverSimRender) so the captured clip
 * looks identical to the live simulator panel.
 */
export async function recordSimVideo(trajectory: TrajectoryPoint[]): Promise<Blob> {
  if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') {
    throw new Error('MediaRecorder is not available in this environment');
  }
  if (trajectory.length === 0) {
    throw new Error('Nothing to record');
  }

  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext('2d');
  if (!ctx || typeof canvas.captureStream !== 'function') {
    throw new Error('Canvas capture is not supported');
  }

  const layout = computeLayout(CANVAS_W, CANVAS_H);
  const mimeType = pickMimeType();
  const stream = canvas.captureStream(SIM_FPS);
  const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
  const chunks: BlobPart[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };

  const recorded = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: mimeType || 'video/webm' }));
    recorder.onerror = () => reject(new Error('Recording failed'));
  });

  recorder.start();
  // Draw frames in real time so the captured stream has natural pacing.
  for (let i = 0; i < trajectory.length; i++) {
    drawSimFrame(ctx, layout, trajectory, i);
    await sleep(1000 / SIM_FPS);
  }
  await sleep(400); // hold the final frame so the clip does not cut off abruptly
  recorder.stop();

  return recorded;
}

function pickMimeType(): string | undefined {
  const candidates = ['video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];
  return candidates.find((type) => MediaRecorder.isTypeSupported(type));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
