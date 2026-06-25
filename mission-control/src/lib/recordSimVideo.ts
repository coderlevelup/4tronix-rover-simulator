import type { TrajectoryPoint } from './simulateCommands';

const CANVAS_SIZE = 600;
const YARD_WIDTH_CM = 400;
const YARD_HEIGHT_CM = 300;
const SCALE = CANVAS_SIZE / YARD_WIDTH_CM;
const FPS = 10; // matches the live canvas playback rate

/**
 * Render a trajectory to a short video (Blob) entirely in the browser: draw each
 * frame to an offscreen canvas and capture it with MediaRecorder. Rejects if the
 * browser cannot capture canvas streams so callers can fall back to the live
 * animation. Drawing mirrors RoverSimulatorScaffold (kept in sync by hand; a
 * future refactor could share a single draw routine).
 */
export async function recordSimVideo(trajectory: TrajectoryPoint[]): Promise<Blob> {
  if (typeof window === 'undefined' || typeof MediaRecorder === 'undefined') {
    throw new Error('MediaRecorder is not available in this environment');
  }
  if (trajectory.length === 0) {
    throw new Error('Nothing to record');
  }

  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_SIZE;
  canvas.height = CANVAS_SIZE;
  const ctx = canvas.getContext('2d');
  if (!ctx || typeof canvas.captureStream !== 'function') {
    throw new Error('Canvas capture is not supported');
  }

  const terrain = await loadTerrain();
  const mimeType = pickMimeType();
  const stream = canvas.captureStream(FPS);
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
    drawFrame(ctx, terrain, trajectory, i);
    await sleep(1000 / FPS);
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

function loadTerrain(): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = '/terrain.jpg';
  });
}

function drawFrame(
  ctx: CanvasRenderingContext2D,
  terrain: HTMLImageElement | null,
  trajectory: TrajectoryPoint[],
  frameIndex: number
) {
  // Background
  if (terrain) {
    ctx.drawImage(terrain, 0, 0, CANVAS_SIZE, CANVAS_SIZE);
  } else {
    ctx.fillStyle = '#634200';
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
  }

  // Grid
  ctx.strokeStyle = 'rgba(139, 105, 20, 0.3)';
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= YARD_WIDTH_CM; i += 50) {
    const x = i * SCALE;
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, CANVAS_SIZE);
    ctx.stroke();
  }
  for (let i = 0; i <= YARD_HEIGHT_CM; i += 50) {
    const y = CANVAS_SIZE - i * SCALE;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(CANVAS_SIZE, y);
    ctx.stroke();
  }

  const toCanvas = (point: TrajectoryPoint) => ({
    x: (point.x + YARD_WIDTH_CM / 2) * SCALE,
    y: CANVAS_SIZE - (point.y + YARD_HEIGHT_CM / 2) * SCALE,
  });

  // Trail up to the current frame
  if (frameIndex > 0) {
    ctx.strokeStyle = 'rgba(59, 130, 246, 0.9)';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i <= frameIndex && i < trajectory.length; i++) {
      const { x, y } = toCanvas(trajectory[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  // Rover
  const state = trajectory[frameIndex];
  const { x: roverX, y: roverY } = toCanvas(state);
  const roverSize = 40;
  ctx.save();
  ctx.translate(roverX, roverY);
  ctx.rotate((state.heading * Math.PI) / 180);

  ctx.fillStyle = '#94a3b8';
  ctx.fillRect(-roverSize / 2, -roverSize / 2, roverSize, roverSize);
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 2;
  ctx.strokeRect(-roverSize / 2, -roverSize / 2, roverSize, roverSize);

  ctx.fillStyle = '#3b82f6';
  ctx.fillRect(-roverSize / 2 + 5, -roverSize / 2 + 5, roverSize - 10, roverSize / 2 - 5);

  ctx.strokeStyle = '#fbbf24';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(roverSize / 2, 0);
  ctx.lineTo(roverSize / 2 + 12, 0);
  ctx.stroke();
  ctx.restore();
}
