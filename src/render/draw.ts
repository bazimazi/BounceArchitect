import type { BallStart, Goal, Level, Piece } from '../core/types';
import type { Particle, Guide, RenderFx } from '../game/session';
import { piecePose } from '../physics/sim';
import type { SimState } from '../physics/sim';
import { BALL_R } from '../physics/sim';
import { worldToScreen, type Camera } from './camera';
import { paintBackdrop, drawTable } from './studio';

export interface DrawWorld {
  width: number;
  height: number;
  dpr: number;
  camera: Camera;
  level: Level;
  pieces: Piece[];
  starts: BallStart[];
  goals: Goal[];
  selected: string[];
  hover: Piece | null;
  hoverOk: boolean;
  guides: Guide[];
  preview: { x: number; y: number }[][];
  ghost: { x: number; y: number }[][];
  trail: { x: number; y: number }[][];
  sim: SimState | null;
  mode: 'build' | 'run';
  time: number;
  reducedMotion: boolean;
  highContrast: boolean;
  showColliders: boolean;
  particles: Particle[];
  shake: number;
  accent: string;
  devText: string;
  fx: RenderFx;
  /** The player's ball finish. Omitted means the workshop default. */
  ball?: BallPaint;
}

export interface BallPaint {
  band: string;
  body: [string, string, string];
}

type Point = { x: number; y: number };

/** Shared per-frame drawing state, so the piece painters stay short. */
interface Pen {
  ctx: CanvasRenderingContext2D;
  camera: Camera;
  /** Animation clock. Zero under reduced motion so every loop holds still. */
  t: number;
  ink: number;
  high: boolean;
}

/** A shaded material: light top face, mid body, dark underside, and an ink edge. */
interface Material {
  hi: string;
  mid: string;
  lo: string;
  edge: string;
}

const WOOD: Material = { hi: '#F8E6C0', mid: '#E4B878', lo: '#B9793C', edge: '#5C3A1E' };
const STEEL: Material = { hi: '#F1F5F9', mid: '#C6D2DD', lo: '#8398AB', edge: '#243140' };
const RUBBER: Material = { hi: '#4B5767', mid: '#2D3743', lo: '#19222D', edge: '#0E141B' };
const BRASS: Material = { hi: '#FFE7BD', mid: '#F4AE5E', lo: '#C45C12', edge: '#7C2D12' };
const GLASS: Material = { hi: 'rgba(240, 253, 255, 0.95)', mid: 'rgba(186, 230, 236, 0.85)', lo: 'rgba(126, 190, 200, 0.9)', edge: '#1F6F78' };

const DEFAULT_BALL: BallPaint = { band: '#F2C681', body: ['#B5CEC8', '#47626A', '#132E38'] };

const TAU = Math.PI * 2;
/** Where the desk lamp sits: shadows fall down and to the right of every piece. */
const SHADOW = { x: 0.09, y: -0.13 };

export function drawWorld(ctx: CanvasRenderingContext2D, input: DrawWorld): void {
  const { width, height, dpr, camera } = input;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  paintBackdrop(ctx, input);

  ctx.save();
  if (!input.reducedMotion && input.shake > 0) {
    const amount = input.shake * input.shake;
    ctx.translate(Math.sin(input.time * 47) * amount * 7, Math.cos(input.time * 39) * amount * 5);
  }
  ctx.translate(width / 2, height / 2);
  ctx.scale(camera.zoom, -camera.zoom);
  ctx.translate(-camera.x, -camera.y);
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const pen: Pen = {
    ctx,
    camera,
    t: input.reducedMotion ? 0 : input.time,
    ink: px(camera, input.highContrast ? 2.4 : 1.5),
    high: input.highContrast,
  };

  drawTable(ctx, input);
  drawGrid(ctx, input);
  drawRuler(ctx, input);
  drawKill(ctx, input);
  drawStageLight(ctx, input);

  for (const path of input.ghost) drawGhostPath(ctx, input, path);
  for (const path of input.preview) drawPreview(ctx, input, path);
  const paint = input.ball ?? DEFAULT_BALL;
  for (const path of input.trail) drawTrail(ctx, input, path, paint);

  const latched = input.sim?.latched ?? [];
  const broken = input.sim?.broken ?? [];
  const all = [...input.level.environment, ...input.pieces, ...(input.hover ? [input.hover] : [])];
  const placed = [...input.level.environment, ...input.pieces];
  for (const piece of placed) drawUnderlay(pen, input, piece);
  if (!input.highContrast) for (const piece of placed) drawShadow(ctx, input, piece, latched, broken);
  for (const piece of input.level.environment) drawPiece(pen, input, piece, false, latched, broken, all);
  for (const piece of input.pieces) drawPiece(pen, input, piece, true, latched, broken, all);
  if (input.hover) drawHover(pen, input, input.hover, latched, broken, all);

  const met = new Set(input.sim?.goalsMet ?? []);
  for (const goal of input.goals) {
    drawGoal(ctx, input, goal, met.has(goal.id), input.selected.includes(`goal:${goal.id}`));
  }
  drawGuides(ctx, input);
  drawBalls(ctx, input, paint);
  drawParticles(ctx, input);
  drawResonance(ctx, input);

  if (input.showColliders) {
    ctx.strokeStyle = 'rgba(190,24,93,0.8)';
    ctx.lineWidth = px(camera, 1);
    for (const piece of placed) {
      const pose = piecePose(piece, input.sim?.t ?? 0, latched, broken);
      ctx.save();
      ctx.translate(pose.x, pose.y);
      ctx.rotate(pose.rot);
      ctx.strokeRect(-piece.w / 2, -piece.h / 2, piece.w, piece.h);
      ctx.restore();
    }
  }

  for (const id of input.selected) {
    const piece = input.pieces.find((entry) => entry.uid === id);
    if (!piece) continue;
    drawSelection(ctx, input, piece, latched, broken);
  }
  ctx.restore();

  drawVignette(ctx, input);
  drawRays(ctx, input);
  drawFlash(ctx, input);
  drawIris(ctx, input);

  if (input.devText) {
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = '13px Outfit, sans-serif';
    ctx.fillStyle = input.highContrast ? '#1B2430' : '#E4EEDF';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(input.devText, 16, 78);
    ctx.restore();
  }
}

/* ------------------------------------------------------------------ */
/* The room: paper, lamp light, drifting dust                          */
/* ------------------------------------------------------------------ */

/** The room dims around the board while the ball runs, like a stage. */
function drawVignette(ctx: CanvasRenderingContext2D, input: DrawWorld): void {
  if (input.highContrast) return;
  const live = input.fx.modeBlend;
  if (live < 0.01) return;
  const { width, height, dpr } = input;
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const span = Math.max(width, height);
  const dim = ctx.createRadialGradient(width / 2, height / 2, span * 0.3, width / 2, height / 2, span * 0.78);
  dim.addColorStop(0, 'rgba(30, 16, 6, 0)');
  dim.addColorStop(1, `rgba(30, 16, 6, ${0.28 * live})`);
  ctx.fillStyle = dim;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* The drafting sheet                                                  */
/* ------------------------------------------------------------------ */

function drawGrid(ctx: CanvasRenderingContext2D, input: DrawWorld): void {
  const { view } = input.level;
  const minor = input.camera.zoom > 36;
  const fade = input.highContrast ? 1 : 1 - input.fx.modeBlend * 0.62;
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.beginPath();
  const step = minor ? 0.5 : 1;
  const x0 = Math.floor(view.x / step) * step;
  const y0 = Math.floor(view.y / step) * step;
  for (let x = x0; x <= view.x + view.w + 0.01; x += step) {
    ctx.moveTo(x, view.y);
    ctx.lineTo(x, view.y + view.h);
  }
  for (let y = y0; y <= view.y + view.h + 0.01; y += step) {
    ctx.moveTo(view.x, y);
    ctx.lineTo(view.x + view.w, y);
  }
  ctx.strokeStyle = input.highContrast ? 'rgba(0,0,0,0.18)' : 'rgba(154, 205, 192, 0.065)';
  ctx.lineWidth = px(input.camera, 1);
  ctx.stroke();
  ctx.beginPath();
  for (let x = Math.ceil(view.x); x <= view.x + view.w; x += 1) {
    ctx.moveTo(x, view.y);
    ctx.lineTo(x, view.y + view.h);
  }
  for (let y = Math.ceil(view.y); y <= view.y + view.h; y += 1) {
    ctx.moveTo(view.x, y);
    ctx.lineTo(view.x + view.w, y);
  }
  ctx.strokeStyle = input.highContrast ? 'rgba(0,0,0,0.28)' : 'rgba(154, 205, 192, 0.12)';
  ctx.lineWidth = px(input.camera, 1.2);
  ctx.stroke();
  if (!input.highContrast) {
    // Registration crosses on every fourth intersection, like a cutting mat.
    ctx.beginPath();
    const c = 0.08;
    for (let x = Math.ceil(view.x / 4) * 4; x <= view.x + view.w; x += 4) {
      for (let y = Math.ceil(view.y / 4) * 4; y <= view.y + view.h; y += 4) {
        ctx.moveTo(x - c, y);
        ctx.lineTo(x + c, y);
        ctx.moveTo(x, y - c);
        ctx.lineTo(x, y + c);
      }
    }
    ctx.strokeStyle = 'rgba(176, 216, 193, 0.32)';
    ctx.lineWidth = px(input.camera, 1.4);
    ctx.stroke();
  }
  ctx.restore();
}

/** Ruler ticks along the sheet's bottom and left edges, with a number every two units. */
function drawRuler(ctx: CanvasRenderingContext2D, input: DrawWorld): void {
  if (input.highContrast) return;
  const fade = 1 - input.fx.modeBlend * 0.8;
  if (fade < 0.05) return;
  const { view } = input.level;
  const cam = input.camera;
  ctx.save();
  ctx.globalAlpha = fade;
  ctx.strokeStyle = 'rgba(174, 201, 183, 0.45)';
  ctx.lineWidth = px(cam, 1);
  ctx.beginPath();
  for (let x = Math.ceil(view.x * 2) / 2; x <= view.x + view.w + 0.001; x += 0.5) {
    const major = Math.abs(x - Math.round(x)) < 0.01;
    ctx.moveTo(x, view.y);
    ctx.lineTo(x, view.y + (major ? 0.16 : 0.08));
  }
  for (let y = Math.ceil(view.y * 2) / 2; y <= view.y + view.h + 0.001; y += 0.5) {
    const major = Math.abs(y - Math.round(y)) < 0.01;
    ctx.moveTo(view.x, y);
    ctx.lineTo(view.x + (major ? 0.16 : 0.08), y);
  }
  ctx.stroke();
  if (cam.zoom > 28) {
    const size = px(cam, 9);
    for (let x = Math.ceil(view.x / 2) * 2; x <= view.x + view.w; x += 2) {
      ctx.save();
      ctx.translate(x, view.y + 0.3);
      worldText(ctx, String(Math.round(x - view.x)), size, 'rgba(174, 201, 183, 0.55)', 500);
      ctx.restore();
    }
    for (let y = Math.ceil(view.y / 2) * 2; y <= view.y + view.h; y += 2) {
      if (Math.abs(y - view.y) < 0.5) continue;
      ctx.save();
      ctx.translate(view.x + 0.34, y);
      worldText(ctx, String(Math.round(y - view.y)), size, 'rgba(174, 201, 183, 0.55)', 500);
      ctx.restore();
    }
  }
  ctx.restore();
}

function drawKill(ctx: CanvasRenderingContext2D, input: DrawWorld): void {
  const { view } = input.level;
  // A kill line below the sheet is marked along the sheet's bottom edge instead, so it stays on the paper.
  const y = Math.max(input.level.killY, view.y - 0.1);
  const stripe = 0.2;
  ctx.save();
  if (!input.highContrast) {
    ctx.beginPath();
    ctx.rect(view.x - 0.18, view.y - 0.18, view.w + 0.36, view.h + 0.36);
    ctx.clip();
    const band = ctx.createLinearGradient(0, y, 0, y + 1.1);
    band.addColorStop(0, 'rgba(159,18,57,0.14)');
    band.addColorStop(1, 'rgba(159,18,57,0)');
    ctx.fillStyle = band;
    ctx.fillRect(view.x - 0.18, y, view.w + 0.36, 1.1);
    // Hazard stripes just under the line, drifting slowly.
    ctx.beginPath();
    ctx.rect(view.x - 0.18, y - stripe, view.w + 0.36, stripe);
    ctx.clip();
    ctx.fillStyle = 'rgba(159,18,57,0.12)';
    ctx.fillRect(view.x - 0.18, y - stripe, view.w + 0.36, stripe);
    const slide = input.reducedMotion ? 0 : (input.time * 0.25) % 0.5;
    ctx.fillStyle = 'rgba(159,18,57,0.3)';
    for (let x = view.x - 0.7 + slide; x < view.x + view.w + 0.5; x += 0.5) {
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 0.25, y);
      ctx.lineTo(x + 0.25 - stripe, y - stripe);
      ctx.lineTo(x - stripe, y - stripe);
      ctx.closePath();
      ctx.fill();
    }
  }
  ctx.restore();
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(view.x - 0.1, y);
  ctx.lineTo(view.x + view.w + 0.1, y);
  ctx.strokeStyle = input.highContrast ? '#9F1239' : 'rgba(159,18,57,0.75)';
  ctx.lineWidth = px(input.camera, 1.6);
  ctx.setLineDash([0.16, 0.12]);
  ctx.lineDashOffset = input.reducedMotion ? 0 : input.time * 0.2;
  ctx.stroke();
  ctx.restore();
}

/** A warm pool of light that follows the ball while it runs. */
function drawStageLight(ctx: CanvasRenderingContext2D, input: DrawWorld): void {
  if (input.highContrast || !input.sim || input.mode !== 'run') return;
  const live = input.fx.modeBlend;
  for (const ball of input.sim.balls) {
    if (!ball.alive) continue;
    const r = 3.4;
    const pool = ctx.createRadialGradient(ball.x, ball.y, 0, ball.x, ball.y, r);
    pool.addColorStop(0, `rgba(255, 214, 150, ${0.34 * live})`);
    pool.addColorStop(0.5, `rgba(255, 190, 120, ${0.1 * live})`);
    pool.addColorStop(1, 'rgba(255, 190, 120, 0)');
    ctx.fillStyle = pool;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, r, 0, TAU);
    ctx.fill();
  }
}

function drawGuides(ctx: CanvasRenderingContext2D, input: DrawWorld): void {
  if (input.guides.length === 0) return;
  const { view } = input.level;
  ctx.save();
  ctx.lineWidth = px(input.camera, 1.25);
  ctx.setLineDash([0.1, 0.08]);
  for (const guide of input.guides) {
    ctx.beginPath();
    if (guide.axis === 'x') {
      ctx.moveTo(guide.at, view.y);
      ctx.lineTo(guide.at, view.y + view.h);
    } else {
      ctx.moveTo(view.x, guide.at);
      ctx.lineTo(view.x + view.w, guide.at);
    }
    ctx.strokeStyle = 'rgba(234,88,12,0.18)';
    ctx.lineWidth = px(input.camera, 5);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(234,88,12,0.85)';
    ctx.lineWidth = px(input.camera, 1.25);
    ctx.stroke();
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* Paths: prediction, the last run, and the live comet                 */
/* ------------------------------------------------------------------ */

function drawGhostPath(ctx: CanvasRenderingContext2D, input: DrawWorld, path: Point[]): void {
  const ink = input.highContrast ? '27,36,48' : '164,199,205';
  strokePath(ctx, path, `rgba(${ink},0.08)`, px(input.camera, 8));
  strokePath(ctx, path, `rgba(${ink},0.45)`, px(input.camera, 1.6), [0.14, 0.1]);
  const last = path[path.length - 1];
  if (last) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(last.x, last.y, BALL_R, 0, TAU);
    ctx.setLineDash([px(input.camera, 3), px(input.camera, 3)]);
    ctx.strokeStyle = `rgba(${ink},0.4)`;
    ctx.lineWidth = px(input.camera, 1.4);
    ctx.stroke();
    ctx.restore();
  }
}

/** The predicted flight: glowing dots that march along, direction chevrons, and a ghost ball at the end. */
function drawPreview(ctx: CanvasRenderingContext2D, input: DrawWorld, path: Point[]): void {
  if (path.length < 2) return;
  const cam = input.camera;
  const high = input.highContrast;
  strokePath(ctx, path, high ? 'rgba(234,88,12,0.25)' : 'rgba(234,88,12,0.12)', px(cam, 12));
  const march = input.reducedMotion ? 0 : input.time * 0.9;
  ctx.save();
  ctx.fillStyle = high ? '#EA580C' : '#F5CF92';
  walkPath(path, 0.2, march % 0.2, (x, y, _angle, along, total) => {
    const k = 1 - along / Math.max(total, 0.01);
    ctx.globalAlpha = 0.35 + k * 0.6;
    ctx.beginPath();
    ctx.arc(x, y, px(cam, 1.6 + k * 1.6), 0, TAU);
    ctx.fill();
  });
  ctx.globalAlpha = 1;
  ctx.strokeStyle = high ? '#C2410C' : '#F5CF92';
  ctx.lineWidth = px(cam, 2);
  walkPath(path, 1.3, 0.65, (x, y, angle) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    const s = px(cam, 6);
    ctx.beginPath();
    ctx.moveTo(-s * 0.6, s);
    ctx.lineTo(s * 0.5, 0);
    ctx.lineTo(-s * 0.6, -s);
    ctx.stroke();
    ctx.restore();
  });
  ctx.restore();
  const last = path[path.length - 1];
  if (last) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(last.x, last.y, BALL_R, 0, TAU);
    ctx.fillStyle = 'rgba(234,88,12,0.12)';
    ctx.fill();
    ctx.setLineDash([px(cam, 4), px(cam, 3)]);
    ctx.lineDashOffset = input.reducedMotion ? 0 : -input.time * 0.3;
    ctx.strokeStyle = 'rgba(234,88,12,0.9)';
    ctx.lineWidth = px(cam, 1.6);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(last.x, last.y, px(cam, 2.5), 0, TAU);
    ctx.fillStyle = '#EA580C';
    ctx.fill();
    ctx.restore();
  }
  if (!input.reducedMotion && !high) travelBeads(ctx, path, input.time);
}

/** A faint full path to read later, plus a bright tapered comet behind the ball. */
function drawTrail(ctx: CanvasRenderingContext2D, input: DrawWorld, path: Point[], paint: BallPaint): void {
  if (path.length < 2) return;
  strokePath(ctx, path, hexAlpha(paint.band, 0.1), px(input.camera, 6));
  strokePath(ctx, path, hexAlpha(paint.band, 0.38), px(input.camera, 1.3));
  if (input.reducedMotion || input.mode !== 'run' || input.sim?.phase === 'lost') return;
  const count = Math.min(path.length - 1, 44);
  const start = path.length - 1 - count;
  ctx.save();
  ctx.globalCompositeOperation = input.highContrast ? 'source-over' : 'screen';
  for (let i = start; i < path.length - 1; i += 1) {
    const a = path[i];
    const b = path[i + 1];
    if (!a || !b || Math.hypot(b.x - a.x, b.y - a.y) > 2.5) continue;
    const k = (i - start + 1) / count;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = hexAlpha(paint.band, 0.05 + k * 0.4);
    ctx.lineWidth = BALL_R * 2.5 * Math.pow(k, 0.8);
    ctx.stroke();
    if (k > 0.35) {
      ctx.strokeStyle = `rgba(255, 244, 222, ${(k - 0.35) * 0.9})`;
      ctx.lineWidth = BALL_R * 0.7 * k;
      ctx.stroke();
    }
    if (i % 5 === 0 && k > 0.25) {
      // Small wake sparks separate from the comet, then fade out behind it.
      const age = 1 - k;
      const tangent = Math.atan2(b.y - a.y, b.x - a.x) + Math.PI / 2;
      const drift = Math.sin(input.time * 3 + i * 2.4) * age * 0.22;
      ctx.fillStyle = hexAlpha(paint.band, k * 0.65);
      ctx.beginPath();
      ctx.arc(a.x + Math.cos(tangent) * drift, a.y + Math.sin(tangent) * drift, px(input.camera, 0.7 + k), 0, TAU);
      ctx.fill();
    }
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* The ball                                                            */
/* ------------------------------------------------------------------ */

function drawBalls(ctx: CanvasRenderingContext2D, input: DrawWorld, paint: BallPaint): void {
  if (input.mode === 'run' && input.sim) {
    const many = input.sim.balls.length > 1;
    input.sim.balls.forEach((ball, index) => {
      if (!ball.alive && ball.y < input.level.killY) return;
      const fx = input.fx.balls.get(ball.id);
      let sx = 0;
      let sy = 0;
      let squash = 0;
      if (fx && !input.reducedMotion && fx.age < 0.6) {
        squash = fx.amp * Math.exp(-fx.age * 9) * Math.cos(fx.age * 42);
        sx = fx.nx;
        sy = fx.ny;
      }
      const speed = Math.hypot(ball.vx, ball.vy);
      if (!input.reducedMotion && !input.highContrast && ball.alive) {
        drawAfterimages(ctx, input.trail[index] ?? [], ball.r, speed, paint);
        drawSpeedLines(ctx, ball.x, ball.y, ball.vx, ball.vy, ball.r, input.camera, input.time);
      }
      drawBall(ctx, {
        x: ball.x,
        y: ball.y,
        r: ball.r,
        vx: ball.vx,
        vy: ball.vy,
        reduced: input.reducedMotion,
        spin: fx?.spin ?? 0,
        squash,
        nx: sx,
        ny: sy,
        paint,
        letter: many ? ball.id.toUpperCase() : undefined,
        glow: input.highContrast ? 0 : clamp01((speed - 3) / 10),
        camera: input.camera,
      });
    });
    return;
  }
  const many = input.starts.length > 1;
  for (const start of input.starts) {
    const r = start.r ?? BALL_R;
    const selected = input.selected.includes(`start:${start.id}`);
    if (input.mode === 'build') drawLaunchPad(ctx, input, start.x, start.y, r);
    if (selected) {
      ctx.beginPath();
      ctx.arc(start.x, start.y, r + 0.12, 0, TAU);
      ctx.strokeStyle = '#1B2430';
      ctx.lineWidth = px(input.camera, 1.5);
      ctx.stroke();
    }
    const bob = input.reducedMotion || input.mode !== 'build' ? 0 : Math.sin(input.time * 2.2) * 0.025;
    drawBall(ctx, {
      x: start.x,
      y: start.y + bob,
      r,
      vx: 0,
      vy: 0,
      reduced: true,
      spin: input.reducedMotion ? 0 : Math.sin(input.time * 0.9) * 0.25,
      squash: 0,
      nx: 0,
      ny: 0,
      paint,
      letter: many ? start.id.toUpperCase() : undefined,
      glow: 0,
      camera: input.camera,
    });
  }
}

/** The ball waits on a drafting pin: a crosshair and a pulse that says "this is where it starts". */
function drawLaunchPad(ctx: CanvasRenderingContext2D, input: DrawWorld, x: number, y: number, r: number): void {
  const cam = input.camera;
  ctx.save();
  ctx.translate(x, y);
  if (!input.highContrast) {
    const beat = input.reducedMotion ? 0.5 : (input.time * 0.8) % 1;
    ctx.beginPath();
    ctx.arc(0, 0, r * (1.3 + beat * 1.2), 0, TAU);
    ctx.strokeStyle = `rgba(234, 88, 12, ${0.5 * (1 - beat)})`;
    ctx.lineWidth = px(cam, 1.6);
    ctx.stroke();
    const halo = ctx.createRadialGradient(0, 0, r * 0.8, 0, 0, r * 2.2);
    halo.addColorStop(0, 'rgba(234, 88, 12, 0.16)');
    halo.addColorStop(1, 'rgba(234, 88, 12, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, r * 2.2, 0, TAU);
    ctx.fill();
  }
  const spin = input.reducedMotion ? 0 : input.time * 0.6;
  ctx.rotate(spin);
  ctx.strokeStyle = input.highContrast ? 'rgba(194, 65, 12, 0.7)' : 'rgba(237, 196, 130, 0.75)';
  ctx.lineWidth = px(cam, 1.4);
  ctx.setLineDash([px(cam, 3), px(cam, 3)]);
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.5, 0, TAU);
  ctx.stroke();
  ctx.setLineDash([]);
  for (let i = 0; i < 4; i += 1) {
    const a = (i / 4) * TAU;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r * 1.62, Math.sin(a) * r * 1.62);
    ctx.lineTo(Math.cos(a) * r * 1.95, Math.sin(a) * r * 1.95);
    ctx.stroke();
  }
  ctx.restore();
}

function drawAfterimages(ctx: CanvasRenderingContext2D, path: Point[], r: number, speed: number, paint: BallPaint): void {
  if (speed < 6 || path.length < 8) return;
  const k = clamp01((speed - 6) / 10);
  ctx.save();
  for (let i = 1; i <= 3; i += 1) {
    const point = path[path.length - 1 - i * 3];
    if (!point) break;
    ctx.globalAlpha = k * (0.22 - i * 0.05);
    ctx.fillStyle = paint.body[1];
    ctx.beginPath();
    ctx.arc(point.x, point.y, r * (1 - i * 0.08), 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function drawSpeedLines(ctx: CanvasRenderingContext2D, x: number, y: number, vx: number, vy: number, r: number, cam: Camera, time: number): void {
  const speed = Math.hypot(vx, vy);
  if (speed < 9) return;
  const k = clamp01((speed - 9) / 9);
  const ux = vx / speed;
  const uy = vy / speed;
  ctx.save();
  ctx.lineWidth = px(cam, 1.6);
  for (let i = -1; i <= 1; i += 1) {
    const flick = 0.6 + 0.4 * Math.sin(time * 40 + i * 2);
    const off = i * r * 0.7;
    const ox = x - uy * off - ux * r * 1.2;
    const oy = y + ux * off - uy * r * 1.2;
    const len = r * (1.2 + k * 2.4) * flick * (i === 0 ? 1.3 : 1);
    ctx.strokeStyle = `rgba(92, 58, 30, ${0.35 * k})`;
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(ox - ux * len, oy - uy * len);
    ctx.stroke();
  }
  ctx.restore();
}

interface BallDraw {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  reduced: boolean;
  spin: number;
  squash: number;
  nx: number;
  ny: number;
  paint: BallPaint;
  letter: string | undefined;
  /** 0 to 1: a warm halo that grows with speed. */
  glow: number;
  camera: Camera;
}

function drawBall(ctx: CanvasRenderingContext2D, ball: BallDraw): void {
  const { r, paint } = ball;
  ctx.save();
  ctx.translate(ball.x, ball.y);
  // Contact shadow: a tight dark core inside a soft penumbra.
  ctx.save();
  ctx.translate(SHADOW.x * 0.6, -r * 0.3 + SHADOW.y);
  ctx.scale(1.25, 0.38);
  const shade = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.1);
  shade.addColorStop(0, 'rgba(48, 24, 12, 0.34)');
  shade.addColorStop(1, 'rgba(48, 24, 12, 0)');
  ctx.fillStyle = shade;
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.1, 0, TAU);
  ctx.fill();
  ctx.restore();

  if (ball.glow > 0.01) {
    const halo = ctx.createRadialGradient(0, 0, r * 0.8, 0, 0, r * (2 + ball.glow));
    halo.addColorStop(0, hexAlpha(paint.band, 0.35 * ball.glow));
    halo.addColorStop(1, hexAlpha(paint.band, 0));
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, 0, r * (2 + ball.glow), 0, TAU);
    ctx.fill();
  }

  const speed = Math.hypot(ball.vx, ball.vy);
  if (!ball.reduced && ball.squash !== 0) {
    // Squash along the contact normal, bulge across it. The spring-back overshoots once.
    const angle = Math.atan2(ball.ny, ball.nx);
    ctx.rotate(angle);
    ctx.scale(1 - ball.squash, 1 + ball.squash * 0.65);
    ctx.rotate(-angle);
  } else if (!ball.reduced && speed > 1) {
    const angle = Math.atan2(ball.vy, ball.vx);
    const stretch = Math.min(0.16, speed / 24);
    ctx.rotate(angle);
    ctx.scale(1 + stretch, 1 - stretch * 0.7);
    ctx.rotate(-angle);
  }
  const body = ctx.createRadialGradient(-r * 0.32, r * 0.34, r * 0.06, 0.02, -0.02, r);
  body.addColorStop(0, paint.body[0]);
  body.addColorStop(0.45, paint.body[1]);
  body.addColorStop(1, paint.body[2]);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fillStyle = body;
  ctx.fill();

  // A painted band and a stud that turn with the ball, so rolling reads at a glance.
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.985, 0, TAU);
  ctx.clip();
  ctx.rotate(ball.spin);
  ctx.fillStyle = hexAlpha(paint.band, 0.95);
  ctx.fillRect(-r, -r * 0.17, r * 2, r * 0.34);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.28)';
  ctx.fillRect(-r, r * 0.1, r * 2, r * 0.05);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.22)';
  ctx.fillRect(-r, -r * 0.17, r * 2, r * 0.05);
  ctx.fillStyle = 'rgba(255, 237, 213, 0.95)';
  ctx.beginPath();
  ctx.arc(r * 0.55, 0, r * 0.1, 0, TAU);
  ctx.fill();
  ctx.fillStyle = hexAlpha(paint.band, 0.9);
  ctx.beginPath();
  ctx.arc(-r * 0.55, 0, r * 0.07, 0, TAU);
  ctx.fill();
  ctx.restore();

  const shadeIn = ctx.createRadialGradient(-r * 0.3, r * 0.3, r * 0.2, 0, 0, r);
  shadeIn.addColorStop(0, 'rgba(255,255,255,0)');
  shadeIn.addColorStop(0.7, 'rgba(11,16,22,0.15)');
  shadeIn.addColorStop(1, 'rgba(11,16,22,0.62)');
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fillStyle = shadeIn;
  ctx.fill();

  // Warm bounce light along the lower right rim, from the paper below.
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.9, -Math.PI * 0.62, -Math.PI * 0.02);
  ctx.strokeStyle = 'rgba(255, 196, 140, 0.5)';
  ctx.lineWidth = r * 0.1;
  ctx.stroke();

  // Glossy window reflection and a hard specular dot.
  ctx.save();
  ctx.translate(-r * 0.32, r * 0.38);
  ctx.rotate(-0.6);
  ctx.beginPath();
  ctx.ellipse(0, 0, r * 0.3, r * 0.15, 0, 0, TAU);
  ctx.fillStyle = 'rgba(255, 250, 240, 0.55)';
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(-r * 0.36, r * 0.4, r * 0.11, 0, TAU);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.95)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-r * 0.08, r * 0.58, r * 0.05, 0, TAU);
  ctx.fillStyle = 'rgba(255, 248, 236, 0.7)';
  ctx.fill();
  ctx.lineWidth = px(ball.camera, 1);
  ctx.strokeStyle = 'rgba(11, 16, 22, 0.55)';
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.stroke();
  if (ball.letter) worldText(ctx, ball.letter, r * 0.7, '#F4F1EA');
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* The ring                                                            */
/* ------------------------------------------------------------------ */

function drawGoal(ctx: CanvasRenderingContext2D, input: DrawWorld, goal: Goal, met: boolean, selected: boolean): void {
  const color = input.highContrast ? (met ? '#0F766E' : '#C2410C') : (met ? '#8CE4C0' : input.accent);
  const reduced = input.reducedMotion;
  const t = reduced ? 0 : input.time;
  const cam = input.camera;
  const breathe = reduced ? 0 : Math.sin(input.time * 2.4);
  let near = 0;
  if (input.mode === 'run' && input.sim && !met) {
    for (const ball of input.sim.balls) {
      if (!ball.alive) continue;
      const d = Math.hypot(ball.x - goal.x, ball.y - goal.y) - goal.r;
      near = Math.max(near, clamp01(1 - d / 2.6));
    }
  }
  const R = goal.r;
  ctx.save();
  ctx.translate(goal.x, goal.y);
  if (!input.highContrast) {
    const reach = R * (met ? 2.3 : 1.7 + near * 0.6);
    const glow = ctx.createRadialGradient(0, 0, R * 0.2, 0, 0, reach);
    glow.addColorStop(0, hexAlpha(color, met ? 0.45 : 0.3 + near * 0.25));
    glow.addColorStop(1, hexAlpha(color, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, reach, 0, TAU);
    ctx.fill();
    if (!reduced) {
      for (let i = 0; i < 2; i += 1) {
        const wave = (input.time * (0.32 + near * 0.8) + i * 0.5) % 1;
        ctx.globalAlpha = (1 - wave) * 0.5;
        ctx.strokeStyle = color;
        ctx.lineWidth = px(cam, 1.5);
        ctx.beginPath();
        ctx.arc(0, 0, R * (1.05 + wave * 0.55), 0, TAU);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    // A slow vortex inside the ring pulls the eye to its middle.
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.97, 0, TAU);
    ctx.clip();
    const well = ctx.createRadialGradient(0, 0, 0, 0, 0, R);
    well.addColorStop(0, hexAlpha(color, met ? 0.35 : 0.2));
    well.addColorStop(1, hexAlpha(color, 0.04));
    ctx.fillStyle = well;
    ctx.fillRect(-R, -R, R * 2, R * 2);
    ctx.rotate(-t * (0.8 + near * 3));
    ctx.strokeStyle = hexAlpha(color, 0.16);
    ctx.lineWidth = px(cam, 1.4);
    for (let k = 0; k < 3; k += 1) {
      ctx.beginPath();
      for (let s = 0; s <= 20; s += 1) {
        const f = s / 20;
        const a = (k / 3) * TAU + f * 2.6;
        const rr = R * (0.95 - f * 0.8);
        if (s === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.stroke();
    }
    ctx.restore();
  }
  if (met) {
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, TAU);
    ctx.fillStyle = 'rgba(15,118,110,0.16)';
    ctx.fill();
  }

  // Orbiting ticks tighten and speed up as a ball closes in.
  const spin = reduced ? 0 : input.time * (0.5 + near * 3.5);
  const orbit = R * (1.24 - near * 0.12);
  ctx.save();
  ctx.rotate(spin);
  ctx.strokeStyle = color;
  ctx.lineWidth = px(cam, 2.4);
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * TAU;
    ctx.beginPath();
    ctx.arc(0, 0, orbit, a, a + 0.24);
    ctx.stroke();
  }
  ctx.restore();

  if (!input.highContrast && !reduced) {
    // Three sparks ride an outer orbit the other way.
    for (let i = 0; i < 3; i += 1) {
      const a = -input.time * (0.9 + near * 2) + (i / 3) * TAU;
      const ox = Math.cos(a) * R * 1.45;
      const oy = Math.sin(a) * R * 1.45;
      const spark = ctx.createRadialGradient(ox, oy, 0, ox, oy, px(cam, 7));
      spark.addColorStop(0, 'rgba(255, 250, 235, 0.95)');
      spark.addColorStop(0.4, hexAlpha(color, 0.6));
      spark.addColorStop(1, hexAlpha(color, 0));
      ctx.fillStyle = spark;
      ctx.beginPath();
      ctx.arc(ox, oy, px(cam, 7), 0, TAU);
      ctx.fill();
    }
  }

  if (!input.highContrast) {
    ctx.lineWidth = px(cam, 8);
    ctx.strokeStyle = hexAlpha(color, 0.18);
    ctx.beginPath();
    ctx.arc(0, 0, R * (1 + breathe * 0.018), 0, TAU);
    ctx.stroke();
  }
  ctx.lineWidth = px(cam, input.highContrast ? 3 : 2.8);
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, R * (1 + breathe * 0.018), 0, TAU);
  ctx.stroke();
  ctx.globalAlpha = 0.8;
  ctx.lineWidth = px(cam, 1.6);
  ctx.beginPath();
  ctx.arc(0, 0, R * 0.62, 0, TAU);
  ctx.stroke();
  ctx.globalAlpha = 1;
  const d = Math.min(0.22, R * 0.28) * (1 + breathe * 0.06 + near * 0.35);
  ctx.save();
  if (!reduced) ctx.rotate(met ? input.time * 3 : Math.sin(input.time * 1.3) * 0.2);
  ctx.beginPath();
  ctx.moveTo(0, d);
  ctx.lineTo(d * 0.72, 0);
  ctx.lineTo(0, -d);
  ctx.lineTo(-d * 0.72, 0);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(0, d);
  ctx.lineTo(d * 0.72, 0);
  ctx.lineTo(0, 0);
  ctx.closePath();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fill();
  ctx.restore();
  if (goal.ballId) worldText(ctx, goal.ballId.toUpperCase(), Math.min(0.28, R * 0.4), color);
  if (selected) {
    ctx.beginPath();
    ctx.arc(0, 0, R + 0.12, 0, TAU);
    ctx.strokeStyle = '#1B2430';
    ctx.lineWidth = px(cam, 1.5);
    ctx.stroke();
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* Placement feedback                                                  */
/* ------------------------------------------------------------------ */

function drawHover(pen: Pen, input: DrawWorld, hover: Piece, latched: readonly string[], broken: readonly string[], all: Piece[]): void {
  const { ctx } = pen;
  const cam = input.camera;
  const pose = piecePose(hover, input.sim?.t ?? 0, latched, broken);
  // Drafting crosshair from the piece to the sheet edges.
  if (!input.highContrast) {
    const { view } = input.level;
    ctx.save();
    ctx.strokeStyle = input.hoverOk ? 'rgba(147, 221, 203, 0.38)' : 'rgba(255, 159, 158, 0.45)';
    ctx.lineWidth = px(cam, 1);
    ctx.setLineDash([px(cam, 4), px(cam, 4)]);
    ctx.beginPath();
    ctx.moveTo(view.x, pose.y);
    ctx.lineTo(view.x + view.w, pose.y);
    ctx.moveTo(pose.x, view.y);
    ctx.lineTo(pose.x, view.y + view.h);
    ctx.stroke();
    ctx.restore();
  }
  const pulse = input.reducedMotion ? 0 : Math.sin(input.time * 6) * 0.08;
  ctx.save();
  ctx.globalAlpha = input.hoverOk ? 0.6 + pulse : 0.22;
  drawPiece(pen, input, hover, true, latched, broken, all);
  ctx.restore();
  ctx.save();
  ctx.translate(pose.x, pose.y);
  ctx.rotate(pose.rot);
  if (input.hoverOk && !input.highContrast) {
    ctx.fillStyle = 'rgba(154, 205, 192, 0.065)';
    ctx.beginPath();
    ctx.roundRect(-hover.w / 2 - 0.06, -hover.h / 2 - 0.06, hover.w + 0.12, hover.h + 0.12, 0.08);
    ctx.fill();
  }
  ctx.lineWidth = px(cam, 1.6);
  ctx.setLineDash([px(cam, 5), px(cam, 4)]);
  ctx.lineDashOffset = input.reducedMotion ? 0 : -input.time * 0.4;
  ctx.strokeStyle = input.highContrast ? (input.hoverOk ? '#0F766E' : '#9F1239') : (input.hoverOk ? '#93DDCB' : '#FF9F9E');
  ctx.beginPath();
  ctx.roundRect(-hover.w / 2 - 0.06, -hover.h / 2 - 0.06, hover.w + 0.12, hover.h + 0.12, 0.08);
  ctx.stroke();
  if (!input.hoverOk) {
    ctx.setLineDash([]);
    ctx.beginPath();
    const s = Math.min(0.18, Math.max(hover.h, 0.2) * 0.5);
    ctx.moveTo(-s, -s);
    ctx.lineTo(s, s);
    ctx.moveTo(s, -s);
    ctx.lineTo(-s, s);
    ctx.lineWidth = px(cam, 2.4);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSelection(ctx: CanvasRenderingContext2D, input: DrawWorld, piece: Piece, latched: readonly string[], broken: readonly string[]): void {
  const pose = piecePose(piece, input.sim?.t ?? 0, latched, broken);
  const pad = 0.1;
  const w = piece.w + pad * 2;
  const h = piece.h + pad * 2;
  const cam = input.camera;
  ctx.save();
  ctx.translate(pose.x, pose.y);
  ctx.rotate(pose.rot);
  if (!input.highContrast) {
    ctx.fillStyle = 'rgba(234, 88, 12, 0.07)';
    ctx.fillRect(-w / 2, -h / 2, w, h);
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = px(cam, 3.6);
  ctx.strokeRect(-w / 2, -h / 2, w, h);
  ctx.strokeStyle = '#1B2430';
  ctx.lineWidth = px(cam, 1.6);
  ctx.setLineDash([px(cam, 6), px(cam, 4)]);
  ctx.lineDashOffset = input.reducedMotion ? 0 : -input.time * 0.5;
  ctx.strokeRect(-w / 2, -h / 2, w, h);
  ctx.setLineDash([]);
  const dot = px(cam, 4.4);
  for (const [cx, cy] of [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]] as const) {
    ctx.beginPath();
    ctx.arc(cx, cy, dot, 0, TAU);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.lineWidth = px(cam, 1.8);
    ctx.strokeStyle = '#EA580C';
    ctx.stroke();
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* Particles and screen effects                                        */
/* ------------------------------------------------------------------ */

/** Thin shock fronts turn collisions into a readable, tactile response. */
function drawResonance(ctx: CanvasRenderingContext2D, input: DrawWorld): void {
  if (input.reducedMotion || input.highContrast || input.fx.pulses.size === 0) return;
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
  for (const piece of [...input.level.environment, ...input.pieces]) {
    const age = input.fx.pulses.get(piece.uid);
    if (age === undefined || age > 0.55 || piece.kind === 'portal' || piece.kind === 'gravity') continue;
    const pose = piecePose(piece, input.sim?.t ?? 0, input.sim?.latched ?? [], input.sim?.broken ?? []);
    const progress = age / 0.55;
    ctx.save();
    ctx.translate(pose.x, pose.y);
    ctx.rotate(pose.rot);
    const spread = 0.06 + (1 - Math.pow(1 - progress, 3)) * 0.42;
    const alpha = Math.pow(1 - progress, 2) * 0.6;
    ctx.strokeStyle = hexAlpha(input.accent, alpha);
    ctx.lineWidth = px(input.camera, 1.8 * (1 - progress) + 0.3);
    ctx.beginPath();
    ctx.roundRect(-piece.w / 2 - spread, -piece.h / 2 - spread, piece.w + spread * 2, piece.h + spread * 2, spread);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();
}

function drawParticles(ctx: CanvasRenderingContext2D, input: DrawWorld): void {
  const camera = input.camera;
  for (const p of input.particles) {
    const a = clamp01(p.life / p.max);
    ctx.save();
    if (p.kind === 'ring') {
      const k = 1 - a;
      const r = p.size * (1 - Math.pow(1 - k, 3));
      ctx.globalAlpha = a * 0.9;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = px(camera, 1 + a * 3.5);
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.01, r), 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = a * 0.25;
      ctx.lineWidth = px(camera, 4 + a * 8);
      ctx.stroke();
    } else if (p.kind === 'spark') {
      ctx.strokeStyle = p.color;
      ctx.globalAlpha = a * 0.3;
      ctx.lineWidth = px(camera, 6) * (0.4 + a);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.05, p.y - p.vy * 0.05);
      ctx.stroke();
      ctx.globalAlpha = a;
      ctx.lineWidth = px(camera, 2.2) * (0.4 + a);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255, 250, 235, 0.9)';
      ctx.lineWidth = px(camera, 1) * (0.4 + a);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.02, p.y - p.vy * 0.02);
      ctx.stroke();
    } else if (p.kind === 'puff') {
      ctx.globalAlpha = a;
      const r = p.size * (1 + (1 - a) * 1.6);
      const soft = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
      soft.addColorStop(0, p.color);
      soft.addColorStop(1, 'rgba(120, 88, 56, 0)');
      ctx.fillStyle = soft;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r, 0, TAU);
      ctx.fill();
    } else if (p.kind === 'shard') {
      ctx.globalAlpha = Math.min(1, a * 1.6);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.moveTo(0, p.size);
      ctx.lineTo(p.size * 0.9, -p.size * 0.6);
      ctx.lineTo(-p.size * 0.7, -p.size * 0.4);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = px(camera, 1);
      ctx.stroke();
      // A glint that flashes as the shard turns.
      const glint = Math.max(0, Math.sin(p.rot * 2));
      if (glint > 0.85) {
        ctx.fillStyle = `rgba(255,255,255,${(glint - 0.85) * 6})`;
        ctx.fill();
      }
    } else if (p.kind === 'confetti') {
      ctx.globalAlpha = Math.min(1, a * 2);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      const flip = Math.cos(p.rot * 2.3);
      ctx.scale(flip, 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size, -p.size * 0.5, p.size * 2, p.size);
      if (flip > 0.6) {
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.fillRect(-p.size, -p.size * 0.5, p.size * 2, p.size * 0.35);
      }
    } else if (p.kind === 'star') {
      const twinkle = 0.7 + 0.3 * Math.sin(p.life * 30);
      ctx.globalAlpha = Math.min(1, a * 1.8);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      const s = p.size * (0.6 + a * 0.6) * twinkle;
      const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 2.2);
      halo.addColorStop(0, 'rgba(255, 236, 170, 0.6)');
      halo.addColorStop(1, 'rgba(255, 236, 170, 0)');
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(0, 0, s * 2.2, 0, TAU);
      ctx.fill();
      ctx.fillStyle = p.color;
      starPath(ctx, s);
      ctx.fill();
      ctx.strokeStyle = 'rgba(146, 64, 14, 0.55)';
      ctx.lineWidth = px(camera, 0.8);
      ctx.stroke();
    } else if (p.kind === 'ember') {
      const r = p.size * (1 + (1 - a) * 0.8);
      const glow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r * 3);
      glow.addColorStop(0, hexAlpha(p.color, 0.9 * a));
      glow.addColorStop(0.3, hexAlpha(p.color, 0.4 * a));
      glow.addColorStop(1, hexAlpha(p.color, 0));
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(p.x, p.y, r * 3, 0, TAU);
      ctx.fill();
    } else {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = a * 0.28;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * 3, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = a;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
  }
}

function starPath(ctx: CanvasRenderingContext2D, s: number): void {
  ctx.beginPath();
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * TAU;
    const r = i % 2 === 0 ? s : s * 0.34;
    if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
    else ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
  }
  ctx.closePath();
}

/** A slow sunburst behind the ring once it is solved, and a shockwave that rolls out from it. */
function drawRays(ctx: CanvasRenderingContext2D, input: DrawWorld): void {
  const rays = input.fx.rays;
  if (!rays || input.reducedMotion || input.highContrast) return;
  const { width, height, dpr } = input;
  const c = worldToScreen(input.camera, width, height, rays.x, rays.y);
  const age = rays.age;
  const fade = clamp01(age / 0.35) * clamp01((3.2 - age) / 1.2);
  const far = Math.hypot(width, height);
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalCompositeOperation = 'screen';
  const burst = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, far * 0.6);
  burst.addColorStop(0, `rgba(255, 226, 160, ${0.55 * fade})`);
  burst.addColorStop(0.3, `rgba(255, 190, 110, ${0.22 * fade})`);
  burst.addColorStop(1, 'rgba(255, 190, 110, 0)');
  ctx.fillStyle = burst;
  ctx.beginPath();
  const count = 14;
  const turn = age * 0.25;
  for (let i = 0; i < count; i += 1) {
    const a = turn + (i / count) * TAU;
    const spread = (TAU / count) * 0.32;
    ctx.moveTo(c.x, c.y);
    ctx.lineTo(c.x + Math.cos(a - spread) * far, c.y + Math.sin(a - spread) * far);
    ctx.lineTo(c.x + Math.cos(a + spread) * far, c.y + Math.sin(a + spread) * far);
    ctx.closePath();
  }
  ctx.fill();
  const glow = ctx.createRadialGradient(c.x, c.y, 0, c.x, c.y, 160);
  glow.addColorStop(0, `rgba(255, 244, 214, ${0.6 * fade})`);
  glow.addColorStop(1, 'rgba(255, 244, 214, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(c.x - 160, c.y - 160, 320, 320);
  ctx.globalCompositeOperation = 'source-over';
  const k = clamp01(age / 0.9);
  if (k < 1) {
    const eased = 1 - Math.pow(1 - k, 3);
    ctx.beginPath();
    ctx.arc(c.x, c.y, eased * far * 0.55, 0, TAU);
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.7 * (1 - k)})`;
    ctx.lineWidth = 2 + 10 * (1 - k);
    ctx.stroke();
  }
  ctx.restore();
}

/** Screen-space color wash for the moment of a win or a loss. */
function drawFlash(ctx: CanvasRenderingContext2D, input: DrawWorld): void {
  const flash = input.fx.flash;
  if (!flash || input.reducedMotion) return;
  const a = clamp01(flash.life / flash.max);
  const { width, height, dpr } = input;
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const edge = ctx.createRadialGradient(width / 2, height / 2, Math.min(width, height) * 0.25, width / 2, height / 2, Math.max(width, height) * 0.75);
  edge.addColorStop(0, `rgba(${flash.color}, ${0.06 * a})`);
  edge.addColorStop(1, `rgba(${flash.color}, ${0.45 * a})`);
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

/** Opening iris from the ball, the classic level-start wipe, trimmed like a lens. */
function drawIris(ctx: CanvasRenderingContext2D, input: DrawWorld): void {
  const iris = input.fx.iris;
  if (iris >= 1 || input.reducedMotion) return;
  const { width, height, dpr } = input;
  const start = input.starts[0];
  const center = start
    ? worldToScreen(input.camera, width, height, start.x, start.y)
    : { x: width / 2, y: height / 2 };
  const far = Math.hypot(Math.max(center.x, width - center.x), Math.max(center.y, height - center.y));
  const k = iris < 0.18 ? 0 : (iris - 0.18) / 0.82;
  const eased = k < 0.5 ? 4 * k * k * k : 1 - Math.pow(-2 * k + 2, 3) / 2;
  const hold = 30 * clamp01(iris / 0.18);
  const r = Math.max(0, hold + eased * far);
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  ctx.arc(center.x, center.y, r, 0, TAU, true);
  const dark = ctx.createRadialGradient(center.x, center.y, r, center.x, center.y, r + far);
  dark.addColorStop(0, '#173B43');
  dark.addColorStop(1, '#071A22');
  ctx.fillStyle = dark;
  ctx.fill('evenodd');
  ctx.beginPath();
  ctx.arc(center.x, center.y, r, 0, TAU);
  ctx.strokeStyle = input.accent;
  ctx.lineWidth = 4;
  ctx.stroke();
  // Lens ticks spin around the opening edge.
  ctx.translate(center.x, center.y);
  ctx.rotate(iris * 2.4);
  ctx.strokeStyle = 'rgba(255, 237, 213, 0.55)';
  ctx.lineWidth = 2;
  for (let i = 0; i < 24; i += 1) {
    const a = (i / 24) * TAU;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * (r + 10), Math.sin(a) * (r + 10));
    ctx.lineTo(Math.cos(a) * (r + (i % 2 ? 16 : 22)), Math.sin(a) * (r + (i % 2 ? 16 : 22)));
    ctx.stroke();
  }
  ctx.restore();
}

/* ------------------------------------------------------------------ */
/* Pieces                                                              */
/* ------------------------------------------------------------------ */

/** Things that sit under a piece rather than on it, such as a mover's rail or a spinner's sweep. */
function drawUnderlay(pen: Pen, input: DrawWorld, piece: Piece): void {
  if (piece.kind !== 'mover' && piece.kind !== 'spinner') return;
  const { ctx } = pen;
  const cam = input.camera;
  ctx.save();
  ctx.translate(piece.x, piece.y);
  ctx.rotate(piece.rot);
  if (piece.kind === 'mover') {
    const half = (piece.props.distance ?? 2) / 2 + piece.w / 2;
    ctx.strokeStyle = pen.high ? 'rgba(92,58,30,0.35)' : 'rgba(177,211,196,0.35)';
    ctx.lineWidth = px(cam, 3);
    ctx.beginPath();
    ctx.moveTo(-half, 0);
    ctx.lineTo(half, 0);
    ctx.stroke();
    ctx.strokeStyle = pen.high ? 'rgba(92,58,30,0.5)' : 'rgba(177,211,196,0.5)';
    ctx.lineWidth = px(cam, 1.2);
    ctx.setLineDash([px(cam, 4), px(cam, 4)]);
    ctx.beginPath();
    ctx.moveTo(-half, -piece.h * 0.9);
    ctx.lineTo(half, -piece.h * 0.9);
    ctx.stroke();
    ctx.setLineDash([]);
    for (const end of [-1, 1]) {
      ctx.beginPath();
      ctx.arc(end * half, 0, 0.06, 0, TAU);
      ctx.fillStyle = '#5C3A1E';
      ctx.fill();
    }
  } else {
    const reach = piece.w / 2;
    ctx.strokeStyle = pen.high ? 'rgba(92,58,30,0.14)' : 'rgba(177,211,196,0.25)';
    ctx.lineWidth = px(cam, 1.2);
    ctx.setLineDash([px(cam, 3), px(cam, 5)]);
    ctx.beginPath();
    ctx.arc(0, 0, reach, 0, TAU);
    ctx.stroke();
    ctx.setLineDash([]);
  }
  ctx.restore();
}

const NO_SHADOW = new Set(['gravity', 'accelerator', 'portal']);

/** Every piece casts its shadow before any piece is drawn, so shadows never land on top of a neighbor. */
function drawShadow(ctx: CanvasRenderingContext2D, input: DrawWorld, piece: Piece, latched: readonly string[], broken: readonly string[]): void {
  if (NO_SHADOW.has(piece.kind)) return;
  const pose = piecePose(piece, input.sim?.t ?? 0, latched, broken);
  if (pose.inactive) return;
  const spawn = input.reducedMotion ? undefined : input.fx.spawns.get(piece.uid);
  const lift = spawn !== undefined && spawn < 0.5 ? 1 + (1 - spawn / 0.5) * 1.5 : 1;
  const h = piece.kind === 'switch' ? piece.h * 0.45 : piece.h;
  ctx.save();
  ctx.translate(pose.x + SHADOW.x * lift, pose.y + SHADOW.y * lift);
  ctx.rotate(pose.rot);
  for (const [grow, alpha] of [[0.07, 0.06], [0.035, 0.08], [0, 0.12]] as const) {
    ctx.fillStyle = `rgba(48, 24, 12, ${alpha / Math.sqrt(lift)})`;
    ctx.beginPath();
    ctx.roundRect(-piece.w / 2 - grow, -h / 2 - grow, piece.w + grow * 2, h + grow * 2, 0.08 + grow);
    ctx.fill();
  }
  ctx.restore();
}

function drawPiece(
  pen: Pen,
  input: DrawWorld,
  piece: Piece,
  owned: boolean,
  latched: readonly string[],
  broken: readonly string[],
  all: Piece[],
): void {
  const { ctx } = pen;
  const pose = piecePose(piece, input.sim?.t ?? 0, latched, broken);
  const spawn = input.reducedMotion ? undefined : input.fx.spawns.get(piece.uid);
  const pulse = input.reducedMotion ? -1 : (input.fx.pulses.get(piece.uid) ?? -1);
  ctx.save();
  ctx.translate(pose.x, pose.y);
  ctx.rotate(pose.rot);
  if (spawn !== undefined && spawn < 0.5) {
    const s = backOut(spawn / 0.5);
    ctx.scale(Math.max(0.01, s), Math.max(0.01, 0.6 + s * 0.4));
  }
  ctx.lineWidth = pen.ink;
  if (pose.inactive && piece.kind === 'breakable') {
    drawShards(ctx, piece.w, piece.h);
    ctx.restore();
    return;
  }
  if (pose.inactive && piece.kind === 'door') {
    drawOpenDoor(pen, piece.w, piece.h);
    ctx.restore();
    return;
  }
  if (pulse >= 0 && THUMP.has(piece.kind)) {
    const k = Math.exp(-pulse * 11) * Math.cos(pulse * 44) * 0.14;
    ctx.translate(0, -k * 0.35);
    ctx.scale(1 + k * 0.08, 1 - k);
  }
  drawBody(pen, piece, pose.inactive, latched.includes(piece.uid), all, pulse);
  if (owned) {
    // A small orange pin marks the pieces the player placed.
    const x = piece.w / 2 - 0.1;
    const y = -piece.h / 2 + 0.06;
    ctx.beginPath();
    ctx.arc(x, y, 0.055, 0, TAU);
    ctx.fillStyle = '#EA580C';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x - 0.015, y + 0.015, 0.02, 0, TAU);
    ctx.fillStyle = 'rgba(255, 237, 213, 0.9)';
    ctx.fill();
  }
  if (spawn !== undefined && spawn < 0.3) {
    ctx.globalAlpha = 1 - spawn / 0.3;
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.roundRect(-piece.w / 2, -piece.h / 2, piece.w, piece.h, 0.06);
    ctx.fill();
  }
  ctx.restore();
}

const THUMP = new Set(['platform', 'ramp', 'wall', 'breakable', 'oneway', 'door', 'mover', 'conveyor']);

function drawBody(pen: Pen, piece: Piece, inactive: boolean, latched: boolean, all: Piece[], pulse: number): void {
  const { ctx, camera, t } = pen;
  const { w, h, kind } = piece;
  const hit = pulse >= 0 ? Math.exp(-pulse * 6) : 0;
  if (kind === 'wall') {
    slab(pen, w, h, STEEL, 0.06);
    brushed(pen, w, h);
    rivets(pen, w, h);
    hitFlash(pen, w, h, hit, 0.06);
    return;
  }
  if (kind === 'platform' || kind === 'ramp' || kind === 'mover' || kind === 'spinner') {
    slab(pen, w, h, WOOD, 0.07);
    woodGrain(pen, w, h, piece.uid);
    if (kind !== 'spinner' && w > 0.9 && h >= 0.16) {
      nail(pen, -w / 2 + 0.16, 0, Math.min(0.045, h * 0.2));
      nail(pen, w / 2 - 0.16, 0, Math.min(0.045, h * 0.2));
    }
    if (kind === 'mover') {
      arrowHead(ctx, w * 0.3, 0, Math.min(0.14, h * 0.6), '#5C3A1E');
      arrowHead(ctx, -w * 0.3, 0, -Math.min(0.14, h * 0.6), '#5C3A1E');
    }
    if (kind === 'spinner') {
      const hub = Math.min(w, h) * 0.42;
      const cap = ctx.createRadialGradient(-hub * 0.3, hub * 0.3, 0, 0, 0, hub);
      cap.addColorStop(0, '#C8A06A');
      cap.addColorStop(1, '#4A2E16');
      ctx.beginPath();
      ctx.arc(0, 0, hub, 0, TAU);
      ctx.fillStyle = cap;
      ctx.fill();
      ctx.strokeStyle = '#3B2412';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(0, 0, hub * 0.4, 0, TAU);
      ctx.fillStyle = '#F0D7A8';
      ctx.fill();
      // Motion arcs trail the spinning ends.
      if (t) {
        ctx.strokeStyle = 'rgba(92,58,30,0.35)';
        ctx.lineWidth = px(camera, 1.4);
        const dir = Math.sign(piece.props.omega ?? 1) || 1;
        for (const end of [-1, 1]) {
          ctx.beginPath();
          ctx.arc(0, 0, w / 2 - 0.04, end > 0 ? -dir * 0.5 : Math.PI - dir * 0.5, end > 0 ? 0 : Math.PI, dir > 0);
          ctx.stroke();
        }
      }
    }
    hitFlash(pen, w, h, hit, 0.07);
    return;
  }
  if (kind === 'oneway') {
    slab(pen, w, h, WOOD, 0.05);
    woodGrain(pen, w, h, piece.uid);
    const drift = t ? ((t * 0.6) % 1) * 0.06 : 0;
    ctx.save();
    ctx.beginPath();
    ctx.rect(-w / 2, -h / 2, w, h);
    ctx.clip();
    ctx.translate(0, drift - 0.03);
    ctx.lineWidth = px(camera, 4);
    chevrons(ctx, w * 0.6, 'y', 3, 'rgba(255, 244, 222, 0.6)');
    ctx.lineWidth = px(camera, 1.8);
    chevrons(ctx, w * 0.6, 'y', 3, '#5C3A1E');
    ctx.restore();
    hitFlash(pen, w, h, hit, 0.05);
    return;
  }
  if (kind === 'conveyor') {
    drawConveyor(pen, piece);
    return;
  }
  if (kind === 'breakable') {
    slab(pen, w, h, GLASS, 0.05);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, 0.05);
    ctx.clip();
    // A glint sweeps across the pane every few seconds.
    const sweep = t ? ((t * 0.35) % 2.2) - 0.6 : 0.2;
    const gx = -w / 2 + sweep * w;
    const glint = ctx.createLinearGradient(gx - 0.3, 0, gx + 0.3, 0);
    glint.addColorStop(0, 'rgba(255,255,255,0)');
    glint.addColorStop(0.5, 'rgba(255,255,255,0.75)');
    glint.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = glint;
    ctx.beginPath();
    ctx.moveTo(gx - 0.25, -h / 2);
    ctx.lineTo(gx + 0.05, -h / 2);
    ctx.lineTo(gx + 0.25, h / 2);
    ctx.lineTo(gx - 0.05, h / 2);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = '#1F6F78';
    ctx.lineWidth = px(camera, 1.2);
    ctx.beginPath();
    ctx.moveTo(-w * 0.2, h * 0.3);
    ctx.lineTo(-w * 0.02, 0);
    ctx.lineTo(w * 0.08, h * 0.1);
    ctx.lineTo(w * 0.22, -h * 0.28);
    ctx.moveTo(-w * 0.02, 0);
    ctx.lineTo(-w * 0.1, -h * 0.3);
    ctx.moveTo(w * 0.08, h * 0.1);
    ctx.lineTo(w * 0.14, h * 0.38);
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = px(camera, 0.8);
    ctx.beginPath();
    ctx.moveTo(-w * 0.2 + 0.01, h * 0.3 + 0.01);
    ctx.lineTo(-w * 0.02 + 0.01, 0.01);
    ctx.stroke();
    hitFlash(pen, w, h, hit, 0.05);
    return;
  }
  if (kind === 'bouncer') {
    const lift = hit * 0.08 * Math.cos(pulse * 30);
    slab(pen, w, h, RUBBER, 0.08);
    if (hit > 0.02) {
      const glow = ctx.createLinearGradient(0, h / 2, 0, h / 2 + 0.6 * hit);
      glow.addColorStop(0, `rgba(251,146,60,${0.7 * hit})`);
      glow.addColorStop(1, 'rgba(251,146,60,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(-w / 2, h / 2, w, 0.6 * hit);
    }
    // The rubber pad: bright, domed, and it jumps when struck.
    const padH = 0.09 + hit * 0.04;
    const padY = h / 2 - 0.1 + lift;
    const pad = ctx.createLinearGradient(0, padY + padH, 0, padY);
    pad.addColorStop(0, hit > 0.3 ? '#FFE0B8' : '#FDBA74');
    pad.addColorStop(1, hit > 0.3 ? '#FB923C' : '#C2410C');
    ctx.fillStyle = pad;
    ctx.beginPath();
    ctx.roundRect(-w / 2 + 0.07, padY, w - 0.14, padH, padH / 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillRect(-w / 2 + 0.14, padY + padH * 0.6, w - 0.28, padH * 0.2);
    for (let x = -w / 2 + 0.25; x < w / 2 - 0.1; x += 0.3) {
      const on = t ? 0.45 + 0.35 * Math.sin(t * 4 - x * 3) : 0.6;
      ctx.fillStyle = `rgba(251,146,60,${on + hit * 0.4})`;
      ctx.beginPath();
      ctx.arc(x, -h * 0.12, 0.032, 0, TAU);
      ctx.fill();
    }
    return;
  }
  if (kind === 'spring') {
    drawSpring(pen, piece, pulse, hit);
    return;
  }
  if (kind === 'cannon') {
    drawCannon(pen, piece, hit);
    return;
  }
  if (kind === 'accelerator') {
    field(pen, w, h, pen.high ? '29, 78, 216' : '141, 203, 233', 0.1 + hit * 0.2);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, 0.12);
    ctx.clip();
    // Streaks race along the field.
    if (t) {
      ctx.lineWidth = px(camera, 1.6);
      for (let i = 0; i < 7; i += 1) {
        const f = (t * (0.9 + hash01(i, 3) * 0.6) + hash01(i, 5)) % 1;
        const x = -w / 2 + f * (w + 0.6) - 0.3;
        const y = (hash01(i, 9) - 0.5) * h * 0.8;
        ctx.strokeStyle = `rgba(190, 231, 255, ${Math.sin(f * Math.PI) * 0.7})`;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x - 0.35, y);
        ctx.stroke();
      }
    }
    const flow = t ? ((t * 0.9) % 1) * (w / 3) : 0;
    ctx.translate(flow - w / 6, 0);
    ctx.lineWidth = px(camera, 5);
    chevrons(ctx, w * 0.9, 'x', 4, 'rgba(255, 237, 213, 0.6)');
    ctx.lineWidth = px(camera, 2.2);
    chevrons(ctx, w * 0.9, 'x', 4, pen.high ? '#1D4ED8' : '#BEE7FF');
    ctx.restore();
    return;
  }
  if (kind === 'gravity') {
    field(pen, w, h, pen.high ? '109, 40, 217' : '182, 164, 239', 0.09 + hit * 0.15);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, 0.12);
    ctx.clip();
    // Pressure bands roll along the pull.
    ctx.strokeStyle = pen.high ? 'rgba(109, 40, 217, 0.3)' : 'rgba(196, 178, 255, 0.35)';
    ctx.lineWidth = px(camera, 2);
    for (let i = 0; i < 4; i += 1) {
      const f = ((t * 0.25) + i / 4) % 1;
      const x = -w / 2 + f * w;
      ctx.globalAlpha = Math.sin(f * Math.PI);
      ctx.beginPath();
      ctx.moveTo(x - 0.25, -h / 2);
      ctx.quadraticCurveTo(x + 0.15, 0, x - 0.25, h / 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (let i = 0; i < 9; i += 1) {
      const f = (t * 0.35 + i / 9) % 1;
      const y = (hash01(i, 41) - 0.5) * h * 0.8;
      const x = -w * 0.42 + f * w * 0.84;
      const a = Math.sin(f * Math.PI) * 0.9;
      const mote = ctx.createRadialGradient(x, y, 0, x, y, 0.1);
      mote.addColorStop(0, `rgba(221, 207, 255, ${a})`);
      mote.addColorStop(1, 'rgba(182, 164, 239, 0)');
      ctx.fillStyle = mote;
      ctx.beginPath();
      ctx.arc(x, y, 0.1, 0, TAU);
      ctx.fill();
    }
    ctx.restore();
    const size = Math.min(0.3, h * 0.2);
    ctx.save();
    ctx.globalAlpha = 0.35;
    arrowHead(ctx, w * 0.28, 0, size * 1.5, '#A78BFA');
    ctx.restore();
    arrowHead(ctx, w * 0.28, 0, size, pen.high ? '#6D28D9' : '#DDD0FF');
    return;
  }
  if (kind === 'portal') {
    drawPortal(pen, piece, all, hit);
    return;
  }
  if (kind === 'switch') {
    drawSwitch(pen, piece, latched || inactive, hit);
    return;
  }
  if (kind === 'door') {
    slab(pen, w, h, STEEL, 0.04);
    hazard(pen, w, h);
    ctx.strokeStyle = '#243140';
    ctx.lineWidth = px(camera, 1.2);
    for (let y = -h * 0.2; y <= h * 0.2 + 0.001; y += h * 0.2) {
      ctx.beginPath();
      ctx.moveTo(-w * 0.28, y);
      ctx.lineTo(w * 0.28, y);
      ctx.stroke();
    }
    // A lamp that shows the door is still shut.
    const lamp = ctx.createRadialGradient(0, 0, 0, 0, 0, 0.12);
    lamp.addColorStop(0, 'rgba(252, 165, 165, 1)');
    lamp.addColorStop(0.4, 'rgba(220, 38, 38, 0.8)');
    lamp.addColorStop(1, 'rgba(220, 38, 38, 0)');
    ctx.fillStyle = lamp;
    ctx.beginPath();
    ctx.arc(0, 0, 0.12, 0, TAU);
    ctx.fill();
    return;
  }
  slab(pen, w, h, WOOD, 0.06);
}

/** Beveled slab: a lit top lip, a shaded underside, soft side edges, and an ink outline. */
function slab(pen: Pen, w: number, h: number, mat: Material, radius: number): void {
  const { ctx } = pen;
  const r = Math.min(radius, w / 2, h / 2);
  const body = ctx.createLinearGradient(0, h / 2, 0, -h / 2);
  body.addColorStop(0, mat.hi);
  body.addColorStop(0.5, mat.mid);
  body.addColorStop(1, mat.lo);
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, r);
  ctx.fillStyle = body;
  ctx.fill();
  if (!pen.high) {
    ctx.save();
    ctx.clip();
    const bev = Math.min(0.05, h * 0.22, w * 0.22);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillRect(-w / 2, h / 2 - bev * 0.7, w, bev * 0.7);
    ctx.fillStyle = 'rgba(30,14,0,0.2)';
    ctx.fillRect(-w / 2, -h / 2, w, bev);
    ctx.fillStyle = 'rgba(255,255,255,0.22)';
    ctx.fillRect(-w / 2, -h / 2, bev * 0.7, h);
    ctx.fillStyle = 'rgba(30,14,0,0.14)';
    ctx.fillRect(w / 2 - bev * 0.8, -h / 2, bev * 0.8, h);
    ctx.restore();
  }
  ctx.lineWidth = pen.ink;
  ctx.strokeStyle = mat.edge;
  ctx.stroke();
}

/** A warm flash across a surface the moment the ball strikes it. */
function hitFlash(pen: Pen, w: number, h: number, hit: number, radius: number): void {
  if (hit < 0.05 || pen.high) return;
  const { ctx } = pen;
  ctx.save();
  ctx.globalAlpha = hit * 0.45;
  ctx.fillStyle = '#FFF4DE';
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, Math.min(radius, w / 2, h / 2));
  ctx.fill();
  ctx.restore();
}

/** Grain lines, a knot and end grain, seeded by the piece so they never swim. */
function woodGrain(pen: Pen, w: number, h: number, seed: string): void {
  const { ctx, camera } = pen;
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, Math.min(0.07, h / 2));
  ctx.clip();
  ctx.lineWidth = px(camera, 1);
  for (let i = 0; i < 4; i += 1) {
    const off = ((hash >> (i * 5)) % 17) / 17 - 0.5;
    const y = (i - 1.5) * h * 0.22;
    ctx.strokeStyle = `rgba(92,58,30,${0.16 + (i % 2) * 0.12})`;
    ctx.beginPath();
    ctx.moveTo(-w * 0.48 + off * 0.3, y);
    ctx.bezierCurveTo(-w * 0.15, y + h * 0.14 * off, w * 0.15, y - h * 0.14 * off, w * (0.46 - off * 0.1), y + h * 0.05 * off);
    ctx.stroke();
  }
  if (w > 1.2 && h > 0.15) {
    const kx = (((hash >> 7) % 100) / 100 - 0.5) * w * 0.5;
    ctx.strokeStyle = 'rgba(92,58,30,0.35)';
    ctx.beginPath();
    ctx.ellipse(kx, 0, h * 0.3, h * 0.14, 0, 0, TAU);
    ctx.stroke();
    ctx.fillStyle = 'rgba(92,58,30,0.25)';
    ctx.beginPath();
    ctx.ellipse(kx, 0, h * 0.12, h * 0.06, 0, 0, TAU);
    ctx.fill();
  }
  // Darker end grain at both cut ends.
  const cap = Math.min(0.06, w * 0.05);
  ctx.fillStyle = 'rgba(92,58,30,0.2)';
  ctx.fillRect(-w / 2, -h / 2, cap, h);
  ctx.fillRect(w / 2 - cap, -h / 2, cap, h);
  ctx.restore();
}

function nail(pen: Pen, x: number, y: number, r: number): void {
  const { ctx } = pen;
  const head = ctx.createRadialGradient(x - r * 0.3, y + r * 0.3, 0, x, y, r);
  head.addColorStop(0, '#F1F5F9');
  head.addColorStop(1, '#475569');
  ctx.fillStyle = head;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(30, 41, 59, 0.6)';
  ctx.lineWidth = px(pen.camera, 0.8);
  ctx.stroke();
}

function rivets(pen: Pen, w: number, h: number): void {
  const r = Math.min(0.035, w * 0.14);
  const long = h >= w;
  const span = long ? h : w;
  for (let s = -span / 2 + 0.18; s <= span / 2 - 0.17; s += 0.5) {
    if (long) nail(pen, 0, s, r);
    else nail(pen, s, 0, r);
  }
}

function brushed(pen: Pen, w: number, h: number): void {
  const { ctx, camera } = pen;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, 0.05);
  ctx.clip();
  const sheen = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
  sheen.addColorStop(0, 'rgba(255,255,255,0)');
  sheen.addColorStop(0.45, 'rgba(255,255,255,0.4)');
  sheen.addColorStop(0.55, 'rgba(255,255,255,0)');
  ctx.fillStyle = sheen;
  ctx.fillRect(-w / 2, -h / 2, w, h);
  ctx.strokeStyle = 'rgba(36,49,64,0.12)';
  ctx.lineWidth = px(camera, 1);
  ctx.beginPath();
  const long = h >= w;
  const span = long ? w : h;
  for (let s = -span / 2 + 0.05; s < span / 2; s += 0.05) {
    if (long) {
      ctx.moveTo(s, -h / 2);
      ctx.lineTo(s, h / 2);
    } else {
      ctx.moveTo(-w / 2, s);
      ctx.lineTo(w / 2, s);
    }
  }
  ctx.stroke();
  ctx.restore();
}

/** Yellow and black stripes at both ends of a door. */
function hazard(pen: Pen, w: number, h: number): void {
  const { ctx } = pen;
  const band = Math.min(0.3, h * 0.16);
  ctx.save();
  for (const end of [-1, 1]) {
    const y0 = end > 0 ? h / 2 - band : -h / 2;
    ctx.save();
    ctx.beginPath();
    ctx.rect(-w / 2, y0, w, band);
    ctx.clip();
    ctx.fillStyle = '#FACC15';
    ctx.fillRect(-w / 2, y0, w, band);
    ctx.fillStyle = '#1B2430';
    for (let s = -w - band; s < w + band; s += 0.14) {
      ctx.beginPath();
      ctx.moveTo(s, y0);
      ctx.lineTo(s + 0.07, y0);
      ctx.lineTo(s + 0.07 + band, y0 + band);
      ctx.lineTo(s + band, y0 + band);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }
  ctx.restore();
}

function drawConveyor(pen: Pen, piece: Piece): void {
  const { ctx, camera, t } = pen;
  const { w, h } = piece;
  const power = piece.props.power ?? 4;
  slab(pen, w, h, RUBBER, h / 2);
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(-w / 2 + 0.04, -h / 2 + 0.04, w - 0.08, h - 0.08, (h - 0.08) / 2);
  ctx.clip();
  // Tread cleats slide along the top and back along the bottom.
  const offset = (t * power * 0.25) % 0.24;
  ctx.fillStyle = 'rgba(244, 241, 234, 0.8)';
  for (let x = -w / 2 - 0.24 + offset; x < w / 2 + 0.24; x += 0.24) {
    ctx.fillRect(x, h / 2 - 0.09, 0.08, 0.06);
    ctx.fillRect(-x - 0.08, -h / 2 + 0.03, 0.08, 0.06);
  }
  ctx.restore();
  for (const end of [-1, 1]) {
    const cx = (end * (w - h)) / 2;
    const rr = h * 0.34;
    const hub = ctx.createRadialGradient(cx - rr * 0.3, rr * 0.3, 0, cx, 0, rr);
    hub.addColorStop(0, '#94A3B8');
    hub.addColorStop(1, '#334155');
    ctx.beginPath();
    ctx.arc(cx, 0, rr, 0, TAU);
    ctx.fillStyle = hub;
    ctx.fill();
    ctx.save();
    ctx.translate(cx, 0);
    ctx.rotate(-t * power * 1.2);
    ctx.strokeStyle = '#F4F1EA';
    ctx.lineWidth = px(camera, 1.4);
    ctx.beginPath();
    for (let i = 0; i < 3; i += 1) {
      const a = (i / 3) * TAU;
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * rr * 0.8, Math.sin(a) * rr * 0.8);
    }
    ctx.stroke();
    ctx.restore();
  }
  const glow = t ? 0.6 + 0.4 * Math.sin(t * 5) : 1;
  ctx.save();
  ctx.globalAlpha = glow;
  arrowHead(ctx, w * 0.1, 0, 0.12, '#FB923C');
  ctx.restore();
  arrowHead(ctx, w * 0.1 - 0.2, 0, 0.09, 'rgba(234, 88, 12, 0.6)');
}

function drawSpring(pen: Pen, piece: Piece, pulse: number, hit: number): void {
  const { ctx, camera, t } = pen;
  const { w, h } = piece;
  const kick = pulse >= 0 ? Math.exp(-pulse * 7) * Math.sin(pulse * 28) * 0.28 : 0;
  const idle = t ? Math.sin(t * 3) * 0.015 : 0;
  const reach = w / 2 - 0.08 + kick + idle;
  const from = -w / 2 + 0.08;
  ctx.save();
  ctx.translate(from, 0);
  slab(pen, 0.16, h * 0.95, BRASS, 0.04);
  ctx.restore();
  // A helix: back strands darker, front strands lighter, so the coil has depth.
  const coils = 5;
  const steps = 60;
  const amp = h * 0.3;
  for (const front of [false, true]) {
    ctx.strokeStyle = front ? '#F59E0B' : '#9A3412';
    ctx.lineWidth = px(camera, front ? 2.6 : 2.2);
    ctx.beginPath();
    let drawing = false;
    for (let i = 0; i <= steps; i += 1) {
      const f = i / steps;
      const phase = f * coils * TAU;
      const isFront = Math.cos(phase) > 0;
      const x = from + f * (reach - from);
      const y = Math.sin(phase) * amp;
      if (isFront === front) {
        if (!drawing) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
        drawing = true;
      } else {
        drawing = false;
      }
    }
    ctx.stroke();
    if (front && !pen.high) {
      ctx.strokeStyle = 'rgba(255, 244, 222, 0.7)';
      ctx.lineWidth = px(camera, 0.9);
      ctx.stroke();
    }
  }
  ctx.save();
  ctx.translate(reach, 0);
  slab(pen, 0.12, h * 0.95, BRASS, 0.03);
  ctx.restore();
  if (hit > 0.2 && !pen.high) {
    const burst = ctx.createRadialGradient(reach + 0.1, 0, 0, reach + 0.1, 0, 0.5 * hit);
    burst.addColorStop(0, `rgba(255, 237, 213, ${hit})`);
    burst.addColorStop(1, 'rgba(251, 146, 60, 0)');
    ctx.fillStyle = burst;
    ctx.beginPath();
    ctx.arc(reach + 0.1, 0, 0.5 * hit, 0, TAU);
    ctx.fill();
  }
  arrowHead(ctx, reach + 0.17, 0, 0.12, hit > 0.2 ? '#EA580C' : '#C45C12');
}

function drawCannon(pen: Pen, piece: Piece, hit: number): void {
  const { ctx, camera, t } = pen;
  const { w, h } = piece;
  const recoil = hit * 0.14;
  ctx.save();
  ctx.translate(-recoil, 0);
  // Barrel: cylinder shading with reinforcing bands.
  const bw = w * 0.82;
  const bh = h * 0.62;
  const barrel = ctx.createLinearGradient(0, bh / 2, 0, -bh / 2);
  barrel.addColorStop(0, '#94A3B8');
  barrel.addColorStop(0.3, '#F1F5F9');
  barrel.addColorStop(0.55, '#64748B');
  barrel.addColorStop(1, '#1E293B');
  ctx.beginPath();
  ctx.roundRect(-bw / 2 + 0.02, -bh / 2, bw, bh, [bh / 2, 0.04, 0.04, bh / 2]);
  ctx.fillStyle = barrel;
  ctx.fill();
  ctx.strokeStyle = '#1B2430';
  ctx.lineWidth = pen.ink;
  ctx.stroke();
  for (const f of [-0.2, 0.15, 0.36]) {
    ctx.fillStyle = 'rgba(27, 36, 48, 0.55)';
    ctx.fillRect(f * w, -bh / 2, 0.05, bh);
  }
  ctx.beginPath();
  ctx.ellipse(bw / 2 + 0.02, 0, 0.05, bh * 0.44, 0, 0, TAU);
  ctx.fillStyle = '#0B1016';
  ctx.fill();
  ctx.restore();
  // Wheel with spokes.
  const wx = -w * 0.18;
  const wy = -h * 0.34;
  const wr = h * 0.28;
  const wheel = ctx.createRadialGradient(wx - wr * 0.3, wy + wr * 0.3, 0, wx, wy, wr);
  wheel.addColorStop(0, '#A87B4F');
  wheel.addColorStop(1, '#4A2E16');
  ctx.beginPath();
  ctx.arc(wx, wy, wr, 0, TAU);
  ctx.fillStyle = wheel;
  ctx.fill();
  ctx.strokeStyle = '#2E1B0B';
  ctx.stroke();
  ctx.save();
  ctx.translate(wx, wy);
  ctx.rotate(-hit * 1.2);
  ctx.strokeStyle = '#E4B878';
  ctx.lineWidth = px(camera, 1.4);
  ctx.beginPath();
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * TAU;
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * wr * 0.8, Math.sin(a) * wr * 0.8);
  }
  ctx.stroke();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(wx, wy, wr * 0.28, 0, TAU);
  ctx.fillStyle = '#C8883A';
  ctx.fill();
  // An ember smolders at the fuse while it waits.
  if (t && !pen.high) {
    const fx = -w * 0.38 - recoil;
    const fy = h * 0.3;
    const flick = 0.7 + 0.3 * Math.sin(t * 17) * Math.sin(t * 7);
    const ember = ctx.createRadialGradient(fx, fy, 0, fx, fy, 0.12);
    ember.addColorStop(0, `rgba(255, 237, 213, ${flick})`);
    ember.addColorStop(0.4, `rgba(251, 146, 60, ${0.7 * flick})`);
    ember.addColorStop(1, 'rgba(251, 146, 60, 0)');
    ctx.fillStyle = ember;
    ctx.beginPath();
    ctx.arc(fx, fy, 0.12, 0, TAU);
    ctx.fill();
  }
  if (hit > 0.05) {
    const flare = ctx.createRadialGradient(w / 2, 0, 0, w / 2, 0, 0.6 * hit + 0.1);
    flare.addColorStop(0, `rgba(255,237,213,${hit})`);
    flare.addColorStop(0.5, `rgba(251,146,60,${0.7 * hit})`);
    flare.addColorStop(1, 'rgba(251,146,60,0)');
    ctx.fillStyle = flare;
    ctx.beginPath();
    ctx.arc(w / 2, 0, 0.6 * hit + 0.1, 0, TAU);
    ctx.fill();
  }
  arrowHead(ctx, w / 2 + 0.06, 0, 0.16, '#EA580C');
}

function drawPortal(pen: Pen, piece: Piece, all: Piece[], hit: number): void {
  const { ctx, camera, t } = pen;
  const { w, h } = piece;
  const color = linkColor(piece.props.link ?? piece.uid);
  const radius = Math.min(w, h) * 0.45;
  if (!pen.high) {
    ctx.save();
    ctx.lineWidth = px(camera, 10 + hit * 8);
    ctx.strokeStyle = hexAlpha(color, 0.18 + hit * 0.2);
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, radius);
    ctx.stroke();
    ctx.restore();
  }
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, radius);
  ctx.clip();
  const depth = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(w, h) * 0.6);
  depth.addColorStop(0, pen.high ? '#FFFFFF' : '#1B1535');
  depth.addColorStop(0.45, hexAlpha(color, 0.75 + hit * 0.25));
  depth.addColorStop(1, 'rgba(255, 250, 242, 0.95)');
  ctx.fillStyle = depth;
  ctx.fillRect(-w / 2, -h / 2, w, h);
  // Spiral arms turn inward.
  ctx.save();
  ctx.scale(w / Math.max(w, h), h / Math.max(w, h));
  ctx.rotate(t * (1.6 + hit * 6));
  const R = Math.max(w, h) * 0.5;
  ctx.lineWidth = px(camera, 1.8);
  for (let k = 0; k < 3; k += 1) {
    ctx.strokeStyle = k % 2 ? 'rgba(255, 255, 255, 0.55)' : hexAlpha(color, 0.9);
    ctx.beginPath();
    for (let s = 0; s <= 24; s += 1) {
      const f = s / 24;
      const a = (k / 3) * TAU + f * 3.4;
      const rr = R * (1 - f * 0.9);
      if (s === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
      else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
    }
    ctx.stroke();
  }
  ctx.restore();
  ctx.restore();
  ctx.strokeStyle = color;
  ctx.lineWidth = px(camera, 3 + hit * 3);
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, radius);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.7)';
  ctx.lineWidth = px(camera, 1);
  ctx.stroke();
  // Motes orbit the rim.
  if (t && !pen.high) {
    for (let i = 0; i < 5; i += 1) {
      const a = t * 1.4 + (i / 5) * TAU;
      const x = Math.cos(a) * w * 0.55;
      const y = Math.sin(a) * h * 0.52;
      const mote = ctx.createRadialGradient(x, y, 0, x, y, px(camera, 6));
      mote.addColorStop(0, 'rgba(255,255,255,0.95)');
      mote.addColorStop(0.4, hexAlpha(color, 0.7));
      mote.addColorStop(1, hexAlpha(color, 0));
      ctx.fillStyle = mote;
      ctx.beginPath();
      ctx.arc(x, y, px(camera, 6), 0, TAU);
      ctx.fill();
    }
  }
  const mark = portalRole(piece, all);
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = '#FFFFFF';
  if (mark === 'a') {
    for (const y of [-0.22, 0, 0.22]) {
      ctx.beginPath();
      ctx.arc(0, y * h, 0.045, 0, TAU);
      ctx.fill();
    }
  } else {
    ctx.lineWidth = px(camera, 2);
    ctx.beginPath();
    ctx.moveTo(-w * 0.2, -h * 0.28);
    ctx.lineTo(w * 0.2, -h * 0.28);
    ctx.moveTo(-w * 0.2, 0);
    ctx.lineTo(w * 0.2, 0);
    ctx.moveTo(-w * 0.2, h * 0.28);
    ctx.lineTo(w * 0.2, h * 0.28);
    ctx.stroke();
  }
}

function drawSwitch(pen: Pen, piece: Piece, on: boolean, hit: number): void {
  const { ctx, camera, t } = pen;
  const { w, h } = piece;
  slab(pen, w, h * 0.45, STEEL, 0.06);
  rivets(pen, w, h * 0.45);
  const color = on ? '15, 118, 110' : '234, 88, 12';
  const cy = h * 0.12;
  const r = on ? h * 0.17 : h * 0.25;
  if (!pen.high) {
    const breathe = t ? 0.7 + 0.3 * Math.sin(t * 3) : 1;
    const halo = ctx.createRadialGradient(0, cy, r * 0.5, 0, cy, r * 2.4);
    halo.addColorStop(0, `rgba(${color}, ${0.4 * breathe + hit * 0.4})`);
    halo.addColorStop(1, `rgba(${color}, 0)`);
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(0, cy, r * 2.4, 0, TAU);
    ctx.fill();
  }
  if (hit > 0.05) {
    ctx.beginPath();
    ctx.arc(0, cy, h * (0.3 + (1 - hit) * 0.5), 0, TAU);
    ctx.strokeStyle = `rgba(15,118,110,${hit})`;
    ctx.lineWidth = px(camera, 2.5);
    ctx.stroke();
  }
  const dome = ctx.createRadialGradient(-r * 0.35, cy + r * 0.35, 0, 0, cy, r);
  dome.addColorStop(0, on ? '#99F6E4' : '#FED7AA');
  dome.addColorStop(0.5, on ? '#14B8A6' : '#F97316');
  dome.addColorStop(1, on ? '#0F766E' : '#C2410C');
  ctx.beginPath();
  ctx.arc(0, cy, r, 0, TAU);
  ctx.fillStyle = dome;
  ctx.fill();
  ctx.lineWidth = pen.ink;
  ctx.strokeStyle = '#1B2430';
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(-r * 0.35, cy + r * 0.38, r * 0.2, 0, TAU);
  ctx.fillStyle = 'rgba(255,255,255,0.8)';
  ctx.fill();
}

function portalRole(piece: Piece, all: Piece[]): 'a' | 'b' {
  const mates = all.filter((other) => other.kind === 'portal' && other.props.link === piece.props.link && other.uid !== 'hover');
  if (piece.uid === 'hover') return mates.length === 0 ? 'a' : 'b';
  const index = mates.findIndex((other) => other.uid === piece.uid);
  return index <= 0 ? 'a' : 'b';
}

function drawOpenDoor(pen: Pen, w: number, h: number): void {
  const { ctx } = pen;
  for (const end of [-1, 1]) {
    ctx.save();
    ctx.translate(0, end * (h / 2 - 0.1));
    slab(pen, Math.max(w, 0.2), 0.2, STEEL, 0.03);
    ctx.restore();
  }
  const lamp = ctx.createRadialGradient(0, h / 2 - 0.1, 0, 0, h / 2 - 0.1, 0.14);
  lamp.addColorStop(0, 'rgba(153, 246, 228, 1)');
  lamp.addColorStop(0.4, 'rgba(15, 118, 110, 0.8)');
  lamp.addColorStop(1, 'rgba(15, 118, 110, 0)');
  ctx.fillStyle = lamp;
  ctx.beginPath();
  ctx.arc(0, h / 2 - 0.1, 0.14, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = 'rgba(36, 49, 64, 0.3)';
  ctx.lineWidth = px(pen.camera, 1);
  ctx.setLineDash([px(pen.camera, 3), px(pen.camera, 3)]);
  ctx.strokeRect(-w / 2, -h / 2 + 0.2, w, h - 0.4);
  ctx.setLineDash([]);
}

function drawShards(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = 'rgba(31,111,120,0.3)';
  ctx.beginPath();
  ctx.moveTo(-w * 0.2, 0);
  ctx.lineTo(-w * 0.05, h * 0.2);
  ctx.lineTo(w * 0.02, -h * 0.05);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(w * 0.12, h * 0.05);
  ctx.lineTo(w * 0.28, -h * 0.08);
  ctx.lineTo(w * 0.18, h * 0.16);
  ctx.fill();
  ctx.fillStyle = 'rgba(31,111,120,0.18)';
  ctx.beginPath();
  ctx.moveTo(-w * 0.42, -h * 0.1);
  ctx.lineTo(-w * 0.34, h * 0.12);
  ctx.lineTo(-w * 0.3, -h * 0.2);
  ctx.fill();
}

/** A glowing field with a soft inner light and a dashed boundary. */
function field(pen: Pen, w: number, h: number, rgb: string, alpha: number): void {
  const { ctx, camera } = pen;
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, 0.12);
  const inner = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(w, h) * 0.6);
  inner.addColorStop(0, `rgba(${rgb}, ${alpha * 1.6})`);
  inner.addColorStop(1, `rgba(${rgb}, ${alpha * 0.6})`);
  ctx.fillStyle = inner;
  ctx.fill();
  ctx.save();
  ctx.setLineDash([0.12, 0.08]);
  ctx.lineDashOffset = pen.t ? -pen.t * 0.3 : 0;
  ctx.strokeStyle = `rgb(${rgb})`;
  ctx.lineWidth = px(camera, 1.6);
  ctx.stroke();
  ctx.restore();
  if (!pen.high) {
    ctx.save();
    ctx.strokeStyle = `rgba(${rgb}, 0.15)`;
    ctx.lineWidth = px(camera, 6);
    ctx.stroke();
    ctx.restore();
  }
}

function arrowHead(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, fill: string): void {
  ctx.fillStyle = fill;
  ctx.beginPath();
  ctx.moveTo(x + size, y);
  ctx.lineTo(x - size * 0.7, y + size * 0.55);
  ctx.lineTo(x - size * 0.7, y - size * 0.55);
  ctx.closePath();
  ctx.fill();
}

function chevrons(ctx: CanvasRenderingContext2D, span: number, along: 'x' | 'y', count: number, color: string): void {
  ctx.strokeStyle = color;
  ctx.beginPath();
  for (let i = 0; i < count; i += 1) {
    const t = count === 1 ? 0 : -span / 2 + (i * span) / (count - 1);
    if (along === 'x') {
      ctx.moveTo(t - 0.1, -0.1);
      ctx.lineTo(t + 0.08, 0);
      ctx.lineTo(t - 0.1, 0.1);
    } else {
      ctx.moveTo(-0.1, t - 0.1);
      ctx.lineTo(0, t + 0.08);
      ctx.lineTo(0.1, t - 0.1);
    }
  }
  ctx.stroke();
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

/** Three glowing beads ride the predicted path so its direction reads without text. */
function travelBeads(ctx: CanvasRenderingContext2D, points: Point[], time: number): void {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    if (a && b) total += pathDistance(a, b);
  }
  if (total < 0.05) return;
  const heads = [0, 1, 2].map((bead) => (time * 2.4 + (bead * total) / 3) % total);
  walkPath(points, total / 240, 0, (x, y, _angle, along) => {
    for (const head of heads) {
      if (Math.abs(along - head) > total / 480) continue;
      const glow = ctx.createRadialGradient(x, y, 0, x, y, 0.24);
      glow.addColorStop(0, 'rgba(255, 248, 236, 0.95)');
      glow.addColorStop(0.4, 'rgba(234, 88, 12, 0.7)');
      glow.addColorStop(1, 'rgba(234, 88, 12, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, 0.24, 0, TAU);
      ctx.fill();
    }
  });
}

/** Calls back at even spacing along a polyline, with the heading and distance so far. */
function walkPath(
  points: Point[],
  spacing: number,
  offset: number,
  visit: (x: number, y: number, angle: number, along: number, total: number) => void,
): void {
  if (points.length < 2 || spacing <= 0) return;
  let total = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    if (a && b) total += pathDistance(a, b);
  }
  let next = offset;
  let walked = 0;
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    if (!a || !b) continue;
    const length = pathDistance(a, b);
    if (length <= 0) continue;
    const angle = Math.atan2(b.y - a.y, b.x - a.x);
    while (next <= walked + length) {
      const f = (next - walked) / length;
      visit(a.x + (b.x - a.x) * f, a.y + (b.y - a.y) * f, angle, next, total);
      next += spacing;
    }
    walked += length;
  }
}

function worldText(ctx: CanvasRenderingContext2D, text: string, size: number, color: string, weight = 600): void {
  ctx.save();
  ctx.scale(1, -1);
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px Outfit, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, size * 0.15);
  ctx.restore();
}

function strokePath(ctx: CanvasRenderingContext2D, points: Point[], color: string, width: number, dash?: number[], dashOffset = 0): void {
  if (points.length < 2) return;
  ctx.beginPath();
  const first = points[0];
  if (!first) return;
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < points.length; i += 1) {
    const point = points[i];
    const previous = points[i - 1];
    if (point && previous) {
      if (Math.hypot(point.x - previous.x, point.y - previous.y) > 2.5) ctx.moveTo(point.x, point.y);
      else ctx.lineTo(point.x, point.y);
    }
  }
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  ctx.setLineDash(dash ?? []);
  ctx.lineDashOffset = dashOffset;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
}

export function linkColor(link: string): string {
  const colors = ['#EA580C', '#0F766E', '#1D4ED8', '#BE185D'];
  let hash = 0;
  for (let i = 0; i < link.length; i += 1) hash = (hash * 33 + link.charCodeAt(i)) >>> 0;
  return colors[hash % colors.length] ?? '#EA580C';
}

/** A portal jump is not a flown segment. Keep light trails out of the gap. */
function pathDistance(a: Point, b: Point): number {
  const distance = Math.hypot(b.x - a.x, b.y - a.y);
  return distance > 2.5 ? 0 : distance;
}

/** Accepts #RRGGBB, or an rgb()/rgba() string whose alpha is replaced. */
function hexAlpha(color: string, alpha: number): string {
  if (color.startsWith('rgb')) {
    const parts = color.replace(/rgba?\(|\)/g, '').split(',').slice(0, 3).join(',');
    return `rgba(${parts},${alpha})`;
  }
  const value = color.replace('#', '');
  if (value.length !== 6) return `rgba(234,88,12,${alpha})`;
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** A stable pseudo-random number in [0, 1) for index i. */
function hash01(i: number, salt: number): number {
  const s = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return s - Math.floor(s);
}

function backOut(t: number): number {
  const k = Math.min(1, Math.max(0, t)) - 1;
  return 1 + 2.4 * k * k * k + 1.4 * k * k;
}

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function px(camera: Camera, pixels: number): number {
  return pixels / Math.max(camera.zoom, 1);
}
