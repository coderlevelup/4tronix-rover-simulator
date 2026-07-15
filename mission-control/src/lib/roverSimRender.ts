/**
 * 2D rover-simulator drawing for the live simulator panel (RoverSimulator).
 *
 * Inspired by the 4tronix Qt simulator: a top-down yard with a vector
 * rover whose four wheels steer to their servo angles.
 */

export interface SimPoint {
  x: number;
  y: number;
  heading: number;
  servos: Record<string, number>;
}

export interface SimLayout {
  w: number;
  h: number;
  s: number; // px per cm
  ox: number; // x offset of the yard within the canvas
  oy: number; // y offset of the yard within the canvas
}

// The physical yard (matches the Qt simulator: 400 x 300 cm).
export const YARD_W = 400;
export const YARD_H = 300;
export const SIM_FPS = 10; // trajectory is sampled at 0.1s steps
const MARGIN = 14; // px inset so the rover never clips the panel edge

// Servo ids for the four steerable wheels (front/rear, left/right).
const FL = '9';
const FR = '15';
const RL = '11';
const RR = '13';

// Deterministic crater field (world cm) so the terrain reads as Mars without a
// muddy photo. Each is [x, y, radius].
const CRATERS: [number, number, number][] = [
  [-130, 80, 34],
  [90, 60, 26],
  [140, -70, 40],
  [-90, -90, 22],
  [20, 120, 18],
  [-160, -30, 16],
];

export function computeLayout(w: number, h: number): SimLayout {
  // Clamp to >= 0: a container briefly smaller than the margins (mid-layout)
  // would otherwise yield a negative scale and an illegal gradient radius.
  const s = Math.max(0, Math.min((w - 2 * MARGIN) / YARD_W, (h - 2 * MARGIN) / YARD_H));
  return { w, h, s, ox: (w - YARD_W * s) / 2, oy: (h - YARD_H * s) / 2 };
}

function worldToScreen(L: SimLayout, wx: number, wy: number): [number, number] {
  return [L.ox + (wx + YARD_W / 2) * L.s, L.oy + (YARD_H / 2 - wy) * L.s];
}

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function interpolate(traj: SimPoint[], p: number): SimPoint {
  const len = traj.length;
  const i0 = Math.max(0, Math.min(len - 1, Math.floor(p)));
  const i1 = Math.min(len - 1, i0 + 1);
  const f = Math.max(0, Math.min(1, p - i0));
  const a = traj[i0];
  const b = traj[i1];
  const sv = (k: string) => lerp(a.servos?.[k] ?? 0, b.servos?.[k] ?? 0, f);
  return {
    x: lerp(a.x, b.x, f),
    y: lerp(a.y, b.y, f),
    heading: lerp(a.heading, b.heading, f),
    servos: { [FL]: sv(FL), [FR]: sv(FR), [RL]: sv(RL), [RR]: sv(RR) },
  };
}

function drawTerrain(ctx: CanvasRenderingContext2D, L: SimLayout) {
  const { w, h, s, ox, oy } = L;
  const yardW = YARD_W * s;
  const yardH = YARD_H * s;

  // Opaque base behind the (possibly letterboxed) yard.
  ctx.fillStyle = '#1a0f0a';
  ctx.fillRect(0, 0, w, h);

  ctx.save();
  ctx.beginPath();
  ctx.roundRect(ox, oy, yardW, yardH, 16);
  ctx.clip();

  // Warm Mars ground: a soft radial wash, lighter in the middle.
  const grad = ctx.createRadialGradient(
    ox + yardW / 2, oy + yardH * 0.42, yardW * 0.1,
    ox + yardW / 2, oy + yardH / 2, yardW * 0.75
  );
  grad.addColorStop(0, '#7c4a2b');
  grad.addColorStop(0.55, '#5a3320');
  grad.addColorStop(1, '#34190d');
  ctx.fillStyle = grad;
  ctx.fillRect(ox, oy, yardW, yardH);

  // Craters: a darker bowl with a faint sunlit rim for depth.
  for (const [cx, cy, cr] of CRATERS) {
    const [px, py] = worldToScreen(L, cx, cy);
    const r = cr * s;
    const cg = ctx.createRadialGradient(px, py - r * 0.2, r * 0.2, px, py, r);
    cg.addColorStop(0, 'rgba(0,0,0,0.28)');
    cg.addColorStop(0.8, 'rgba(0,0,0,0.10)');
    cg.addColorStop(1, 'rgba(255,210,170,0.05)');
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Faint measurement grid every 50 cm.
  ctx.strokeStyle = 'rgba(255,190,150,0.08)';
  ctx.lineWidth = 1;
  for (let gx = -YARD_W / 2; gx <= YARD_W / 2; gx += 50) {
    const [sx] = worldToScreen(L, gx, 0);
    ctx.beginPath();
    ctx.moveTo(sx, oy);
    ctx.lineTo(sx, oy + yardH);
    ctx.stroke();
  }
  for (let gy = -YARD_H / 2; gy <= YARD_H / 2; gy += 50) {
    const [, sy] = worldToScreen(L, 0, gy);
    ctx.beginPath();
    ctx.moveTo(ox, sy);
    ctx.lineTo(ox + yardW, sy);
    ctx.stroke();
  }

  // Top/bottom edge shadow for a subtle "arena" depth.
  const vg = ctx.createLinearGradient(0, oy, 0, oy + yardH);
  vg.addColorStop(0, 'rgba(0,0,0,0.30)');
  vg.addColorStop(0.15, 'rgba(0,0,0,0)');
  vg.addColorStop(0.85, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(0,0,0,0.35)');
  ctx.fillStyle = vg;
  ctx.fillRect(ox, oy, yardW, yardH);
  ctx.restore();

  // Start pad at the origin (where every run begins).
  const [hx, hy] = worldToScreen(L, 0, 0);
  ctx.strokeStyle = 'rgba(52,211,153,0.9)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(hx, hy, 10, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = 'rgba(52,211,153,0.18)';
  ctx.fill();

  // Yard border (Mars orange) to frame the play area.
  ctx.strokeStyle = 'rgba(255,109,0,0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(ox, oy, yardW, yardH, 16);
  ctx.stroke();
}

function drawTrail(ctx: CanvasRenderingContext2D, L: SimLayout, traj: SimPoint[], endIdx: number) {
  if (endIdx <= 0) return;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4;
  ctx.strokeStyle = '#2196f3';
  ctx.beginPath();
  for (let i = 0; i <= endIdx && i < traj.length; i++) {
    const [sx, sy] = worldToScreen(L, traj[i].x, traj[i].y);
    if (i === 0) ctx.moveTo(sx, sy);
    else ctx.lineTo(sx, sy);
  }
  ctx.stroke();
}

function drawRover(ctx: CanvasRenderingContext2D, L: SimLayout, st: SimPoint) {
  const [cx, cy] = worldToScreen(L, st.x, st.y);
  // Icon is drawn a touch larger than scale so kids can see it clearly.
  const scale = Math.max(0.7, Math.min(1.7, L.s / 1.4));
  const bw = 30 * scale;
  const bh = 38 * scale;
  const halfW = bw / 2;
  const halfH = bh / 2;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((st.heading * Math.PI) / 180); // front points along heading

  // Soft contact shadow.
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.ellipse(2, 3, halfW + 4, halfH + 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const wheelH = 11 * scale;
  const wheel = (lx: number, ly: number, angle: number) => {
    ctx.save();
    ctx.translate(lx, ly);
    ctx.rotate((angle * Math.PI) / 180);
    ctx.fillStyle = '#0f172a';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(-3.1 * scale, -wheelH / 2, 6.2 * scale, wheelH, 2.6 * scale);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = 'rgba(148,163,184,0.7)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(-2 * scale, 0);
    ctx.lineTo(2 * scale, 0);
    ctx.stroke();
    ctx.restore();
  };

  // The M.A.R.S. rover has six wheels: the four corners steer to their servo
  // angles; the middle pair is fixed (front toward -y). Middle wheels sit a
  // touch more outboard, like the real chassis.
  const frontY = -halfH * 0.66;
  const rearY = halfH * 0.66;
  wheel(-halfW - 1, frontY, st.servos?.[FL] ?? 0);
  wheel(halfW + 1, frontY, st.servos?.[FR] ?? 0);
  wheel(-halfW - 2, 0, 0);
  wheel(halfW + 2, 0, 0);
  wheel(-halfW - 1, rearY, st.servos?.[RL] ?? 0);
  wheel(halfW + 1, rearY, st.servos?.[RR] ?? 0);

  // Chassis.
  ctx.fillStyle = '#e2e8f0';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(-halfW, -halfH, bw, bh, 7 * scale);
  ctx.fill();
  ctx.stroke();

  // Solar / top plate (Mars orange).
  ctx.fillStyle = '#ff6d00';
  ctx.beginPath();
  ctx.roundRect(-halfW + 4 * scale, -halfH + 6 * scale, bw - 8 * scale, bh * 0.42, 4 * scale);
  ctx.fill();

  // Camera mast (a friendly "eye") near the front.
  ctx.fillStyle = '#0ea5e9';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, -halfH * 0.45, 4 * scale, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Headlight blip marking the front.
  ctx.fillStyle = '#fde68a';
  ctx.beginPath();
  ctx.arc(0, -halfH - 2 * scale, 2.4 * scale, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

/**
 * Draw a full simulator frame (terrain + trail + rover) for a given playhead.
 * `playhead` may be fractional; the rover position is interpolated for smooth
 * motion. With an empty trajectory the rover is parked at the start pad.
 */
export function drawSimFrame(
  ctx: CanvasRenderingContext2D,
  L: SimLayout,
  traj: SimPoint[],
  playhead: number
) {
  // Skip degenerate layouts (container not laid out yet) to avoid drawing with
  // a zero/negative scale.
  if (L.w <= 0 || L.h <= 0 || L.s <= 0) return;
  drawTerrain(ctx, L);
  if (traj.length === 0) {
    drawRover(ctx, L, { x: 0, y: 0, heading: 0, servos: {} });
    return;
  }
  drawTrail(ctx, L, traj, Math.floor(playhead));
  drawRover(ctx, L, interpolate(traj, playhead));
}
