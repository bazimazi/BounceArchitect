import type { BallStart, Goal, Level, Piece } from '../core/types';
import type { Particle, Guide, RenderFx } from '../game/session';
import { piecePose } from '../physics/sim';
import type { SimState } from '../physics/sim';
import { BALL_R } from '../physics/sim';
import { worldToScreen, type Camera } from './camera';

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
}

const TAU = Math.PI * 2;

export function drawWorld(ctx: CanvasRenderingContext2D, input: DrawWorld): void {
  const { width, height, dpr, camera } = input;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  paintPaper(ctx, width, height, input.highContrast, input.time, input.reducedMotion);

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

  drawTable(ctx, input);
  drawGrid(ctx, input);
  drawKill(ctx, input);
  for (const path of input.ghost) {
    strokePath(ctx, path, 'rgba(27,36,48,0.1)', px(camera, 7));
    strokePath(ctx, path, 'rgba(27,36,48,0.5)', px(camera, 1.8), [0.14, 0.1]);
  }
  for (const path of input.preview) {
    strokePath(ctx, path, 'rgba(234,88,12,0.16)', px(camera, 10));
    strokePath(ctx, path, 'rgba(234,88,12,0.9)', px(camera, 2.2), [0.16, 0.1], input.reducedMotion ? 0 : -input.time * 0.6);
    const last = path[path.length - 1];
    if (last) {
      ctx.beginPath();
      ctx.arc(last.x, last.y, 0.08, 0, TAU);
      ctx.fillStyle = '#EA580C';
      ctx.fill();
    }
    if (!input.reducedMotion && !input.highContrast) travelBeads(ctx, path, input.time);
  }
  for (const path of input.trail) drawTrail(ctx, input, path);

  const latched = input.sim?.latched ?? [];
  const broken = input.sim?.broken ?? [];
  const anim = input.reducedMotion ? 0 : input.time;
  const all = [...input.level.environment, ...input.pieces, ...(input.hover ? [input.hover] : [])];
  for (const piece of input.level.environment) drawPiece(ctx, input, piece, false, latched, broken, anim, all);
  for (const piece of input.pieces) drawPiece(ctx, input, piece, true, latched, broken, anim, all);
  if (input.hover) drawHover(ctx, input, input.hover, latched, broken, anim, all);

  const met = new Set(input.sim?.goalsMet ?? []);
  for (const goal of input.goals) {
    drawGoal(ctx, input, goal, met.has(goal.id), input.selected.includes(`goal:${goal.id}`));
  }
  drawGuides(ctx, input);
  drawBalls(ctx, input);
  drawParticles(ctx, input);

  if (input.showColliders) {
    ctx.strokeStyle = 'rgba(190,24,93,0.8)';
    ctx.lineWidth = px(camera, 1);
    for (const piece of [...input.level.environment, ...input.pieces]) {
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

  drawFlash(ctx, input);
  drawIris(ctx, input);

  if (input.devText) {
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = '13px Outfit, sans-serif';
    ctx.fillStyle = '#1B2430';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText(input.devText, 16, 78);
    ctx.restore();
  }
}

function paintPaper(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  high: boolean,
  time: number,
  reduced: boolean,
): void {
  if (high) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
    return;
  }
  const wash = ctx.createLinearGradient(0, 0, width, height);
  wash.addColorStop(0, '#E7D3B8');
  wash.addColorStop(0.42, '#F4EADF');
  wash.addColorStop(1, '#CDB89A');
  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, width, height);

  const drift = reduced ? 0 : time;
  const lampX = width * (0.46 + Math.sin(drift * 0.17) * 0.03);
  const lampY = height * (0.38 + Math.cos(drift * 0.13) * 0.02);
  const lamp = ctx.createRadialGradient(lampX, lampY, 20, lampX, lampY, width * 0.55);
  lamp.addColorStop(0, 'rgba(255, 214, 156, 0.55)');
  lamp.addColorStop(0.4, 'rgba(255, 160, 80, 0.12)');
  lamp.addColorStop(1, 'rgba(255, 160, 80, 0)');
  ctx.fillStyle = lamp;
  ctx.fillRect(0, 0, width, height);

  const coolX = width * (0.78 + Math.cos(drift * 0.11) * 0.04);
  const coolY = height * (0.18 + Math.sin(drift * 0.09) * 0.03);
  const cool = ctx.createRadialGradient(coolX, coolY, 8, coolX, coolY, width * 0.28);
  cool.addColorStop(0, 'rgba(255, 248, 230, 0.4)');
  cool.addColorStop(1, 'rgba(255, 248, 230, 0)');
  ctx.fillStyle = cool;
  ctx.fillRect(0, 0, width, height);

  const vignette = ctx.createRadialGradient(width / 2, height / 2, width * 0.18, width / 2, height * 0.55, width * 0.72);
  vignette.addColorStop(0, 'rgba(62, 32, 12, 0)');
  vignette.addColorStop(1, 'rgba(48, 24, 10, 0.34)');
  ctx.fillStyle = vignette;
  ctx.fillRect(0, 0, width, height);

  const grain = grainPattern(ctx);
  if (grain) {
    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.fillStyle = grain;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }
}

/** The drafting table. It reads as blueprint paper while building and as a live stage while the ball runs. */
function drawTable(ctx: CanvasRenderingContext2D, input: DrawWorld): void {
  if (input.highContrast) return;
  const { view } = input.level;
  const live = input.fx.modeBlend;
  ctx.save();
  ctx.fillStyle = 'rgba(255, 250, 242, 0.55)';
  ctx.beginPath();
  ctx.roundRect(view.x - 0.15, view.y - 0.15, view.w + 0.3, view.h + 0.3, 0.4);
  ctx.fill();
  if (live > 0.01) {
    ctx.fillStyle = `rgba(255, 244, 228, ${0.35 * live})`;
    ctx.fill();
    ctx.strokeStyle = hexAlpha(input.accent, 0.35 * live);
    ctx.lineWidth = px(input.camera, 2);
    ctx.stroke();
  } else {
    ctx.strokeStyle = 'rgba(92, 58, 30, 0.14)';
    ctx.lineWidth = px(input.camera, 1);
    ctx.stroke();
  }
  ctx.restore();
}

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
  ctx.strokeStyle = input.highContrast ? 'rgba(0,0,0,0.18)' : 'rgba(92, 58, 30, 0.08)';
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
  ctx.strokeStyle = input.highContrast ? 'rgba(0,0,0,0.28)' : 'rgba(92, 58, 30, 0.15)';
  ctx.lineWidth = px(input.camera, 1.25);
  ctx.stroke();
  if (!input.highContrast) {
    // Registration crosses on every fourth intersection, like a cutting mat.
    ctx.beginPath();
    const c = 0.07;
    for (let x = Math.ceil(view.x / 4) * 4; x <= view.x + view.w; x += 4) {
      for (let y = Math.ceil(view.y / 4) * 4; y <= view.y + view.h; y += 4) {
        ctx.moveTo(x - c, y);
        ctx.lineTo(x + c, y);
        ctx.moveTo(x, y - c);
        ctx.lineTo(x, y + c);
      }
    }
    ctx.strokeStyle = 'rgba(92, 58, 30, 0.4)';
    ctx.lineWidth = px(input.camera, 1.4);
    ctx.stroke();
  }
  ctx.restore();
}

function drawKill(ctx: CanvasRenderingContext2D, input: DrawWorld): void {
  const { view } = input.level;
  const y = input.level.killY;
  ctx.save();
  if (!input.highContrast) {
    const band = ctx.createLinearGradient(0, y, 0, y - 0.9);
    band.addColorStop(0, 'rgba(159,18,57,0.14)');
    band.addColorStop(1, 'rgba(159,18,57,0)');
    ctx.fillStyle = band;
    ctx.fillRect(view.x, y - 0.9, view.w, 0.9);
  }
  ctx.beginPath();
  ctx.moveTo(view.x, y);
  ctx.lineTo(view.x + view.w, y);
  ctx.strokeStyle = input.highContrast ? '#9F1239' : 'rgba(159,18,57,0.65)';
  ctx.lineWidth = px(input.camera, 1.5);
  ctx.setLineDash([0.16, 0.12]);
  ctx.lineDashOffset = input.reducedMotion ? 0 : input.time * 0.2;
  ctx.stroke();
  ctx.restore();
}

function drawGuides(ctx: CanvasRenderingContext2D, input: DrawWorld): void {
  if (input.guides.length === 0) return;
  const { view } = input.level;
  ctx.save();
  ctx.strokeStyle = 'rgba(234,88,12,0.75)';
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
    ctx.stroke();
  }
  ctx.restore();
}

/** A faint full path to read later, plus a bright tapered comet behind the ball. */
function drawTrail(ctx: CanvasRenderingContext2D, input: DrawWorld, path: { x: number; y: number }[]): void {
  if (path.length < 2) return;
  strokePath(ctx, path, 'rgba(234,88,12,0.14)', px(input.camera, 6));
  strokePath(ctx, path, 'rgba(234,88,12,0.4)', px(input.camera, 1.4));
  if (input.reducedMotion || input.mode !== 'run' || input.sim?.phase === 'lost') return;
  const count = Math.min(path.length - 1, 34);
  const start = path.length - 1 - count;
  for (let i = start; i < path.length - 1; i += 1) {
    const a = path[i];
    const b = path[i + 1];
    if (!a || !b) continue;
    const k = (i - start + 1) / count;
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.strokeStyle = `rgba(251, 146, 60, ${0.08 + k * 0.5})`;
    ctx.lineWidth = BALL_R * 1.6 * k;
    ctx.stroke();
  }
}

function drawBalls(ctx: CanvasRenderingContext2D, input: DrawWorld): void {
  if (input.mode === 'run' && input.sim) {
    const many = input.sim.balls.length > 1;
    for (const ball of input.sim.balls) {
      if (!ball.alive && ball.y < input.level.killY) continue;
      const fx = input.fx.balls.get(ball.id);
      let sx = 0;
      let sy = 0;
      let squash = 0;
      if (fx && !input.reducedMotion && fx.age < 0.6) {
        squash = fx.amp * Math.exp(-fx.age * 9) * Math.cos(fx.age * 42);
        sx = fx.nx;
        sy = fx.ny;
      }
      drawBall(ctx, ball.x, ball.y, ball.r, ball.vx, ball.vy, input.reducedMotion, fx?.spin ?? 0, squash, sx, sy, many ? ball.id.toUpperCase() : undefined);
    }
    return;
  }
  const many = input.starts.length > 1;
  for (const start of input.starts) {
    const r = start.r ?? BALL_R;
    const selected = input.selected.includes(`start:${start.id}`);
    if (input.mode === 'build' && !input.highContrast) {
      const beat = input.reducedMotion ? 0.5 : (input.time * 0.8) % 1;
      ctx.beginPath();
      ctx.arc(start.x, start.y, r * (1.3 + beat * 1.1), 0, TAU);
      ctx.strokeStyle = `rgba(234, 88, 12, ${0.45 * (1 - beat)})`;
      ctx.lineWidth = px(input.camera, 1.5);
      ctx.stroke();
    }
    if (selected) {
      ctx.beginPath();
      ctx.arc(start.x, start.y, r + 0.12, 0, TAU);
      ctx.strokeStyle = '#1B2430';
      ctx.lineWidth = px(input.camera, 1.5);
      ctx.stroke();
    }
    drawBall(ctx, start.x, start.y, r, 0, 0, true, 0, 0, 0, 0, many ? start.id.toUpperCase() : undefined);
  }
}

function drawBall(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  r: number,
  vx: number,
  vy: number,
  reduced: boolean,
  spin: number,
  squash: number,
  nx: number,
  ny: number,
  letter?: string,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.save();
  ctx.translate(0.04, -0.09);
  ctx.scale(1.2, 0.36);
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fillStyle = 'rgba(48, 24, 12, 0.22)';
  ctx.fill();
  ctx.restore();
  const speed = Math.hypot(vx, vy);
  if (!reduced && squash !== 0) {
    // Squash along the contact normal, bulge across it. The spring-back overshoots once.
    const angle = Math.atan2(ny, nx);
    ctx.rotate(angle);
    ctx.scale(1 - squash, 1 + squash * 0.65);
    ctx.rotate(-angle);
  } else if (!reduced && speed > 1) {
    const angle = Math.atan2(vy, vx);
    const stretch = Math.min(0.14, speed / 26);
    ctx.rotate(angle);
    ctx.scale(1 + stretch, 1 - stretch * 0.7);
    ctx.rotate(-angle);
  }
  const body = ctx.createRadialGradient(-r * 0.32, r * 0.34, r * 0.08, 0.02, -0.02, r);
  body.addColorStop(0, '#6D7C8E');
  body.addColorStop(0.42, '#243140');
  body.addColorStop(1, '#0B1016');
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fillStyle = body;
  ctx.fill();

  // A painted band that turns with the ball, so rolling reads at a glance.
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, r * 0.98, 0, TAU);
  ctx.clip();
  ctx.rotate(spin);
  ctx.fillStyle = 'rgba(234, 88, 12, 0.92)';
  ctx.fillRect(-r, -r * 0.17, r * 2, r * 0.34);
  ctx.fillStyle = 'rgba(255, 237, 213, 0.9)';
  ctx.beginPath();
  ctx.arc(r * 0.55, 0, r * 0.1, 0, TAU);
  ctx.fill();
  ctx.restore();

  const shade = ctx.createRadialGradient(-r * 0.3, r * 0.3, r * 0.2, 0, 0, r);
  shade.addColorStop(0, 'rgba(255,255,255,0)');
  shade.addColorStop(0.7, 'rgba(11,16,22,0.15)');
  shade.addColorStop(1, 'rgba(11,16,22,0.6)');
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, TAU);
  ctx.fillStyle = shade;
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-r * 0.3, r * 0.34, r * 0.2, 0, TAU);
  ctx.fillStyle = 'rgba(255, 248, 236, 0.92)';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-r * 0.12, r * 0.52, r * 0.07, 0, TAU);
  ctx.fillStyle = 'rgba(255, 248, 236, 0.6)';
  ctx.fill();
  if (letter) worldText(ctx, letter, r * 0.7, '#F4F1EA');
  ctx.restore();
}

function drawGoal(ctx: CanvasRenderingContext2D, input: DrawWorld, goal: Goal, met: boolean, selected: boolean): void {
  const color = met ? '#0F766E' : input.accent;
  const reduced = input.reducedMotion;
  const breathe = reduced ? 0 : Math.sin(input.time * 2.4);
  let near = 0;
  if (input.mode === 'run' && input.sim && !met) {
    for (const ball of input.sim.balls) {
      if (!ball.alive) continue;
      const d = Math.hypot(ball.x - goal.x, ball.y - goal.y) - goal.r;
      near = Math.max(near, clamp01(1 - d / 2.6));
    }
  }
  ctx.save();
  ctx.translate(goal.x, goal.y);
  if (!input.highContrast) {
    const reach = goal.r * (met ? 2.1 : 1.65 + near * 0.5);
    const glow = ctx.createRadialGradient(0, 0, goal.r * 0.2, 0, 0, reach);
    glow.addColorStop(0, met ? 'rgba(15,118,110,0.4)' : hexAlpha(input.accent, 0.3 + near * 0.25));
    glow.addColorStop(1, hexAlpha(input.accent, 0));
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, reach, 0, TAU);
    ctx.fill();
    if (!reduced) {
      const wave = (input.time * (0.32 + near * 0.8)) % 1;
      ctx.globalAlpha = (1 - wave) * 0.55;
      ctx.strokeStyle = color;
      ctx.lineWidth = px(input.camera, 1.5);
      ctx.beginPath();
      ctx.arc(0, 0, goal.r * (1.05 + wave * 0.45), 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
  if (met) {
    ctx.beginPath();
    ctx.arc(0, 0, goal.r, 0, TAU);
    ctx.fillStyle = 'rgba(15,118,110,0.16)';
    ctx.fill();
  }

  // Orbiting ticks tighten and speed up as a ball closes in.
  const spin = reduced ? 0 : input.time * (0.5 + near * 3.5);
  const orbit = goal.r * (1.22 - near * 0.12);
  ctx.save();
  ctx.rotate(spin);
  ctx.strokeStyle = color;
  ctx.lineWidth = px(input.camera, 2.2);
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * TAU;
    ctx.beginPath();
    ctx.arc(0, 0, orbit, a, a + 0.22);
    ctx.stroke();
  }
  ctx.restore();

  ctx.lineWidth = px(input.camera, input.highContrast ? 3 : 2.6);
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, goal.r * (1 + breathe * 0.018), 0, TAU);
  ctx.stroke();
  ctx.globalAlpha = 0.8;
  ctx.beginPath();
  ctx.arc(0, 0, goal.r * 0.62, 0, TAU);
  ctx.stroke();
  ctx.globalAlpha = 1;
  const d = Math.min(0.22, goal.r * 0.28) * (1 + breathe * 0.06 + near * 0.35);
  ctx.save();
  if (!reduced) ctx.rotate(met ? input.time * 3 : 0);
  ctx.beginPath();
  ctx.moveTo(0, d);
  ctx.lineTo(d * 0.72, 0);
  ctx.lineTo(0, -d);
  ctx.lineTo(-d * 0.72, 0);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
  ctx.restore();
  if (goal.ballId) worldText(ctx, goal.ballId.toUpperCase(), Math.min(0.28, goal.r * 0.4), color);
  if (selected) {
    ctx.beginPath();
    ctx.arc(0, 0, goal.r + 0.12, 0, TAU);
    ctx.strokeStyle = '#1B2430';
    ctx.lineWidth = px(input.camera, 1.5);
    ctx.stroke();
  }
  ctx.restore();
}

function drawHover(
  ctx: CanvasRenderingContext2D,
  input: DrawWorld,
  hover: Piece,
  latched: readonly string[],
  broken: readonly string[],
  anim: number,
  all: Piece[],
): void {
  const pulse = input.reducedMotion ? 0 : Math.sin(input.time * 6) * 0.08;
  ctx.save();
  ctx.globalAlpha = input.hoverOk ? 0.55 + pulse : 0.2;
  drawPiece(ctx, input, hover, true, latched, broken, anim, all);
  ctx.restore();
  const pose = piecePose(hover, input.sim?.t ?? 0, latched, broken);
  ctx.save();
  ctx.translate(pose.x, pose.y);
  ctx.rotate(pose.rot);
  ctx.lineWidth = px(input.camera, 1.6);
  ctx.setLineDash([px(input.camera, 5), px(input.camera, 4)]);
  ctx.lineDashOffset = input.reducedMotion ? 0 : -input.time * 0.4;
  ctx.strokeStyle = input.hoverOk ? 'rgba(15,118,110,0.8)' : '#9F1239';
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
    ctx.lineWidth = px(input.camera, 2.4);
    ctx.stroke();
  }
  ctx.restore();
}

function drawSelection(
  ctx: CanvasRenderingContext2D,
  input: DrawWorld,
  piece: Piece,
  latched: readonly string[],
  broken: readonly string[],
): void {
  const pose = piecePose(piece, input.sim?.t ?? 0, latched, broken);
  const pad = 0.1;
  const w = piece.w + pad * 2;
  const h = piece.h + pad * 2;
  ctx.save();
  ctx.translate(pose.x, pose.y);
  ctx.rotate(pose.rot);
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = px(input.camera, 3.4);
  ctx.strokeRect(-w / 2, -h / 2, w, h);
  ctx.strokeStyle = '#1B2430';
  ctx.lineWidth = px(input.camera, 1.6);
  ctx.setLineDash([px(input.camera, 6), px(input.camera, 4)]);
  ctx.lineDashOffset = input.reducedMotion ? 0 : -input.time * 0.5;
  ctx.strokeRect(-w / 2, -h / 2, w, h);
  ctx.setLineDash([]);
  const dot = px(input.camera, 4.2);
  for (const [cx, cy] of [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]] as const) {
    ctx.beginPath();
    ctx.arc(cx, cy, dot, 0, TAU);
    ctx.fillStyle = '#FFFFFF';
    ctx.fill();
    ctx.lineWidth = px(input.camera, 1.6);
    ctx.strokeStyle = '#EA580C';
    ctx.stroke();
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
    } else if (p.kind === 'spark') {
      ctx.globalAlpha = a;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = px(camera, 2.4) * (0.4 + a);
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x - p.vx * 0.045, p.y - p.vy * 0.045);
      ctx.stroke();
    } else if (p.kind === 'puff') {
      ctx.globalAlpha = a;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1 + (1 - a) * 1.6), 0, TAU);
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
      ctx.strokeStyle = 'rgba(255,255,255,0.7)';
      ctx.lineWidth = px(camera, 1);
      ctx.stroke();
    } else if (p.kind === 'confetti') {
      ctx.globalAlpha = Math.min(1, a * 2);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.scale(Math.cos(p.rot * 2.3), 1);
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size, -p.size * 0.5, p.size * 2, p.size);
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
  edge.addColorStop(1, `rgba(${flash.color}, ${0.42 * a})`);
  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, width, height);
  ctx.restore();
}

/** Opening iris from the ball, the classic level-start wipe. */
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
  const hold = 26 * clamp01(iris / 0.18);
  const r = hold + eased * far;
  ctx.save();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.beginPath();
  ctx.rect(0, 0, width, height);
  ctx.arc(center.x, center.y, Math.max(0, r), 0, TAU, true);
  ctx.fillStyle = '#1B2430';
  ctx.fill('evenodd');
  ctx.beginPath();
  ctx.arc(center.x, center.y, Math.max(0, r), 0, TAU);
  ctx.strokeStyle = input.accent;
  ctx.lineWidth = 4;
  ctx.stroke();
  ctx.restore();
}

function drawPiece(
  ctx: CanvasRenderingContext2D,
  input: DrawWorld,
  piece: Piece,
  owned: boolean,
  latched: readonly string[],
  broken: readonly string[],
  anim: number,
  all: Piece[],
): void {
  const pose = piecePose(piece, input.sim?.t ?? 0, latched, broken);
  const ink = input.highContrast ? 2.4 : 1.6;
  const spawn = input.reducedMotion ? undefined : input.fx.spawns.get(piece.uid);
  const pulse = input.reducedMotion ? -1 : (input.fx.pulses.get(piece.uid) ?? -1);
  ctx.save();
  ctx.translate(pose.x, pose.y);
  ctx.rotate(pose.rot);
  if (spawn !== undefined && spawn < 0.5) {
    const s = backOut(spawn / 0.5);
    ctx.scale(Math.max(0.01, s), Math.max(0.01, 0.6 + s * 0.4));
  }
  ctx.lineWidth = px(input.camera, ink);
  if (pose.inactive && piece.kind === 'breakable') {
    drawShards(ctx, piece.w, piece.h);
    ctx.restore();
    return;
  }
  if (pose.inactive && piece.kind === 'door') {
    drawOpenDoor(ctx, piece.h);
    ctx.restore();
    return;
  }
  if (pulse >= 0 && THUMP.has(piece.kind)) {
    const k = Math.exp(-pulse * 11) * Math.cos(pulse * 44) * 0.14;
    ctx.translate(0, -k * 0.35);
    ctx.scale(1 + k * 0.08, 1 - k);
  }
  if (piece.kind !== 'gravity' && piece.kind !== 'accelerator' && piece.kind !== 'portal' && piece.kind !== 'switch') {
    shadow(ctx, piece.w, piece.h);
  }
  drawBody(ctx, piece, pose.inactive, latched.includes(piece.uid), anim, input.camera, all, pulse);
  if (owned) {
    ctx.fillStyle = '#EA580C';
    ctx.beginPath();
    ctx.arc(piece.w / 2 - 0.1, -piece.h / 2 + 0.06, 0.05, 0, TAU);
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

function drawBody(
  ctx: CanvasRenderingContext2D,
  piece: Piece,
  inactive: boolean,
  latched: boolean,
  anim: number,
  camera: Camera,
  all: Piece[],
  pulse: number,
): void {
  const { w, h, kind } = piece;
  const hit = pulse >= 0 ? Math.exp(-pulse * 6) : 0;
  if (kind === 'wall') {
    plank(ctx, w, h, '#D5DEE6', '#6E8498', '#243140', 0.06);
    ctx.strokeStyle = 'rgba(36,49,64,0.25)';
    ctx.lineWidth = px(camera, 1);
    ctx.beginPath();
    for (let y = -h / 2 + 0.3; y < h / 2 - 0.1; y += 0.3) {
      ctx.moveTo(-w * 0.3, y);
      ctx.lineTo(w * 0.3, y);
    }
    ctx.stroke();
    return;
  }
  if (kind === 'platform' || kind === 'ramp' || kind === 'mover' || kind === 'spinner') {
    plank(ctx, w, h, '#F0D7A8', '#C8883A', '#5C3A1E', 0.07);
    woodGrain(ctx, w, h, camera, piece.uid);
    if (kind === 'mover') {
      arrowHead(ctx, w * 0.3, 0, Math.min(0.14, h * 0.6), '#5C3A1E');
      arrowHead(ctx, -w * 0.3, 0, -Math.min(0.14, h * 0.6), '#5C3A1E');
    }
    if (kind === 'spinner') {
      ctx.beginPath();
      ctx.arc(0, 0, Math.min(w, h) * 0.34, 0, TAU);
      ctx.fillStyle = '#5C3A1E';
      ctx.fill();
      ctx.beginPath();
      ctx.arc(0, 0, Math.min(w, h) * 0.14, 0, TAU);
      ctx.fillStyle = '#F0D7A8';
      ctx.fill();
    }
    return;
  }
  if (kind === 'oneway') {
    plank(ctx, w, h, '#F0D7A8', '#C8883A', '#5C3A1E', 0.05);
    const drift = anim ? ((anim * 0.6) % 1) * 0.06 : 0;
    ctx.save();
    ctx.translate(0, drift - 0.03);
    chevrons(ctx, w * 0.55, 'y', 3, '#5C3A1E');
    ctx.restore();
    return;
  }
  if (kind === 'conveyor') {
    plank(ctx, w, h, '#2C3540', '#1B2430', '#1B2430', 0.05);
    ctx.save();
    ctx.beginPath();
    ctx.rect(-w / 2 + 0.06, -h / 2 + 0.05, w - 0.12, h - 0.1);
    ctx.clip();
    ctx.strokeStyle = '#F4F1EA';
    ctx.lineWidth = px(camera, 2);
    const offset = (anim * (piece.props.power ?? 4) * 0.25) % 0.36;
    for (let x = -w / 2 + offset; x < w / 2; x += 0.36) {
      ctx.beginPath();
      ctx.moveTo(x, -h / 2);
      ctx.lineTo(x + 0.12, h / 2);
      ctx.stroke();
    }
    ctx.restore();
    for (const end of [-1, 1]) {
      ctx.beginPath();
      ctx.arc((end * (w - h)) / 2, 0, h * 0.34, 0, TAU);
      ctx.fillStyle = '#3B4652';
      ctx.fill();
      ctx.save();
      ctx.translate((end * (w - h)) / 2, 0);
      ctx.rotate(-anim * (piece.props.power ?? 4) * 1.2);
      ctx.strokeStyle = '#F4F1EA';
      ctx.lineWidth = px(camera, 1.4);
      ctx.beginPath();
      ctx.moveTo(-h * 0.26, 0);
      ctx.lineTo(h * 0.26, 0);
      ctx.stroke();
      ctx.restore();
    }
    arrowHead(ctx, w * 0.38, 0, 0.12, '#EA580C');
    return;
  }
  if (kind === 'breakable') {
    plank(ctx, w, h, '#E7F4F6', '#B7D4D8', '#1F6F78', 0.05);
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillRect(-w / 2 + 0.08, h / 2 - 0.08, w * 0.4, 0.035);
    ctx.strokeStyle = '#1F6F78';
    ctx.lineWidth = px(camera, 1.2);
    ctx.beginPath();
    ctx.moveTo(-w * 0.2, h * 0.3);
    ctx.lineTo(-w * 0.02, 0);
    ctx.lineTo(w * 0.08, h * 0.1);
    ctx.lineTo(w * 0.22, -h * 0.28);
    ctx.moveTo(-w * 0.02, 0);
    ctx.lineTo(-w * 0.1, -h * 0.3);
    ctx.stroke();
    return;
  }
  if (kind === 'bouncer') {
    const lift = hit * 0.08 * Math.cos(pulse * 30);
    plank(ctx, w, h, '#2C3540', '#1B2430', '#1B2430', 0.08);
    if (hit > 0.02) {
      const glow = ctx.createLinearGradient(0, h / 2, 0, h / 2 + 0.5 * hit);
      glow.addColorStop(0, `rgba(251,146,60,${0.6 * hit})`);
      glow.addColorStop(1, 'rgba(251,146,60,0)');
      ctx.fillStyle = glow;
      ctx.fillRect(-w / 2, h / 2, w, 0.5 * hit);
    }
    ctx.fillStyle = hit > 0.3 ? '#FDBA74' : '#EA580C';
    ctx.fillRect(-w / 2 + 0.08, h / 2 - 0.1 + lift, w - 0.16, 0.08 + hit * 0.04);
    ctx.fillStyle = 'rgba(234,88,12,0.6)';
    for (let x = -w / 2 + 0.25; x < w / 2 - 0.1; x += 0.3) {
      ctx.beginPath();
      ctx.arc(x, -h * 0.1, 0.03, 0, TAU);
      ctx.fill();
    }
    return;
  }
  if (kind === 'spring') {
    const kick = pulse >= 0 ? Math.exp(-pulse * 7) * Math.sin(pulse * 28) * 0.28 : 0;
    const idle = anim ? Math.sin(anim * 3) * 0.015 : 0;
    const reach = w / 2 - 0.08 + kick + idle;
    plank(ctx, 0.16, Math.min(h, 0.5), '#E7C7A2', '#C47A3A', '#5C3A1E', 0.04);
    ctx.save();
    ctx.translate(-w / 2 + 0.08, 0);
    plank(ctx, 0.16, h * 0.9, '#E7C7A2', '#C47A3A', '#5C3A1E', 0.04);
    ctx.restore();
    ctx.strokeStyle = '#C45C12';
    ctx.lineWidth = px(camera, 2.4);
    ctx.beginPath();
    const coils = 4;
    const from = -w / 2 + 0.08;
    for (let i = 0; i <= 40; i += 1) {
      const t = i / 40;
      const x = from + t * (reach - from);
      const y = Math.sin(t * coils * TAU) * h * 0.3;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.save();
    ctx.translate(reach, 0);
    plank(ctx, 0.1, h * 0.9, '#FDBA74', '#EA580C', '#7C2D12', 0.03);
    ctx.restore();
    arrowHead(ctx, reach + 0.14, 0, 0.12, hit > 0.2 ? '#EA580C' : '#C45C12');
    return;
  }
  if (kind === 'cannon') {
    const recoil = hit * 0.14;
    ctx.save();
    ctx.translate(-recoil, 0);
    plank(ctx, w * 0.78, h * 0.7, '#D5DEE6', '#6E8498', '#243140', 0.08);
    ctx.beginPath();
    ctx.arc(w * 0.28, 0, h * 0.28, 0, TAU);
    ctx.fillStyle = '#1B2430';
    ctx.fill();
    ctx.restore();
    ctx.beginPath();
    ctx.arc(-w * 0.18, -h * 0.34, h * 0.26, 0, TAU);
    ctx.fillStyle = '#5C3A1E';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(-w * 0.18, -h * 0.34, h * 0.1, 0, TAU);
    ctx.fillStyle = '#C8883A';
    ctx.fill();
    if (hit > 0.05) {
      const flare = ctx.createRadialGradient(w / 2, 0, 0, w / 2, 0, 0.5 * hit + 0.1);
      flare.addColorStop(0, `rgba(255,237,213,${hit})`);
      flare.addColorStop(0.5, `rgba(251,146,60,${0.7 * hit})`);
      flare.addColorStop(1, 'rgba(251,146,60,0)');
      ctx.fillStyle = flare;
      ctx.beginPath();
      ctx.arc(w / 2, 0, 0.5 * hit + 0.1, 0, TAU);
      ctx.fill();
    }
    arrowHead(ctx, w / 2, 0, 0.16, '#EA580C');
    return;
  }
  if (kind === 'accelerator') {
    field(ctx, w, h, 'rgba(234,88,12,0.14)', '#EA580C');
    ctx.save();
    ctx.beginPath();
    ctx.rect(-w / 2, -h / 2, w, h);
    ctx.clip();
    const flow = anim ? ((anim * 0.9) % 1) * (w / 3) : 0;
    ctx.translate(flow - w / 6, 0);
    chevrons(ctx, w * 0.9, 'x', 4, '#C2410C');
    ctx.restore();
    if (hit > 0.05) {
      ctx.fillStyle = `rgba(251,146,60,${0.25 * hit})`;
      ctx.fillRect(-w / 2, -h / 2, w, h);
    }
    return;
  }
  if (kind === 'gravity') {
    field(ctx, w, h, 'rgba(109,40,217,0.1)', '#6D28D9');
    arrowHead(ctx, w * 0.28, 0, Math.min(0.28, h * 0.18), '#6D28D9');
    ctx.fillStyle = '#6D28D9';
    for (let i = 0; i < 6; i += 1) {
      const t = (anim * 0.35 + i / 6) % 1;
      ctx.globalAlpha = Math.sin(t * Math.PI) * 0.9;
      ctx.beginPath();
      ctx.arc(-w * 0.38 + t * w * 0.76, (((i * 37) % 7) / 7 - 0.5) * h * 0.7, 0.05, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    return;
  }
  if (kind === 'portal') {
    const color = linkColor(piece.props.link ?? piece.uid);
    ctx.fillStyle = 'rgba(244,241,234,0.92)';
    ctx.strokeStyle = color;
    ctx.lineWidth = px(camera, 3 + hit * 3);
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, Math.min(w, h) * 0.4);
    ctx.fill();
    ctx.stroke();
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, Math.min(w, h) * 0.4);
    ctx.clip();
    const swirl = ctx.createRadialGradient(0, 0, 0, 0, 0, Math.max(w, h) * 0.6);
    swirl.addColorStop(0, hexAlpha(color, 0.35 + hit * 0.4));
    swirl.addColorStop(1, hexAlpha(color, 0.02));
    ctx.fillStyle = swirl;
    ctx.fillRect(-w / 2, -h / 2, w, h);
    ctx.strokeStyle = hexAlpha(color, 0.55);
    ctx.lineWidth = px(camera, 1.4);
    for (let i = 0; i < 3; i += 1) {
      const t = (anim * 0.5 + i / 3) % 1;
      ctx.globalAlpha = 1 - t;
      ctx.beginPath();
      ctx.ellipse(0, 0, Math.max(0.01, w * 0.45 * (1 - t)), Math.max(0.01, h * 0.45 * (1 - t)), 0, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
    const mark = portalRole(piece, all);
    if (mark === 'a') {
      ctx.fillStyle = color;
      for (const y of [-0.18, 0, 0.18]) {
        ctx.beginPath();
        ctx.arc(0, y * h, 0.045, 0, TAU);
        ctx.fill();
      }
    } else {
      ctx.strokeStyle = color;
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
    return;
  }
  if (kind === 'switch') {
    plank(ctx, w, h * 0.45, '#D5DEE6', '#7E93A6', '#243140', 0.06);
    const on = latched || inactive;
    if (hit > 0.05) {
      ctx.beginPath();
      ctx.arc(0, h * 0.12, h * (0.3 + (1 - hit) * 0.5), 0, TAU);
      ctx.strokeStyle = `rgba(15,118,110,${hit})`;
      ctx.lineWidth = px(camera, 2.5);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(0, h * 0.12, on ? h * 0.16 : h * 0.24, 0, TAU);
    ctx.fillStyle = on ? '#0F766E' : '#EA580C';
    ctx.fill();
    ctx.strokeStyle = '#1B2430';
    ctx.stroke();
    return;
  }
  if (kind === 'door') {
    plank(ctx, w, h, '#C9D4DE', '#8AA0B4', '#243140', 0.04);
    ctx.strokeStyle = '#243140';
    ctx.lineWidth = px(camera, 1.2);
    for (let y = -h * 0.3; y <= h * 0.3; y += h * 0.3) {
      ctx.beginPath();
      ctx.moveTo(-w * 0.3, y);
      ctx.lineTo(w * 0.3, y);
      ctx.stroke();
    }
    return;
  }
  plank(ctx, w, h, '#F0D7A8', '#C8883A', '#5C3A1E', 0.06);
}

/** Three quiet grain lines, seeded by the piece so they never swim. */
function woodGrain(ctx: CanvasRenderingContext2D, w: number, h: number, camera: Camera, seed: string): void {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  ctx.save();
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, Math.min(0.07, h / 2));
  ctx.clip();
  ctx.strokeStyle = 'rgba(92,58,30,0.28)';
  ctx.lineWidth = px(camera, 1);
  for (let i = 0; i < 3; i += 1) {
    const off = ((hash >> (i * 5)) % 17) / 17 - 0.5;
    const y = (i - 1) * h * 0.26;
    ctx.beginPath();
    ctx.moveTo(-w * 0.46 + off * 0.3, y);
    ctx.bezierCurveTo(-w * 0.15, y + h * 0.12 * off, w * 0.15, y - h * 0.12 * off, w * (0.4 - off * 0.1), y);
    ctx.stroke();
  }
  ctx.fillStyle = 'rgba(255,255,255,0.35)';
  ctx.fillRect(-w / 2 + 0.04, h / 2 - Math.min(0.05, h * 0.25), w - 0.08, Math.min(0.03, h * 0.14));
  ctx.restore();
}

function portalRole(piece: Piece, all: Piece[]): 'a' | 'b' {
  const mates = all.filter((other) => other.kind === 'portal' && other.props.link === piece.props.link && other.uid !== 'hover');
  if (piece.uid === 'hover') return mates.length === 0 ? 'a' : 'b';
  const index = mates.findIndex((other) => other.uid === piece.uid);
  return index <= 0 ? 'a' : 'b';
}

function drawOpenDoor(ctx: CanvasRenderingContext2D, h: number): void {
  ctx.fillStyle = '#8AA0B4';
  ctx.fillRect(-0.08, h / 2 - 0.12, 0.16, 0.16);
  ctx.fillRect(-0.08, -h / 2, 0.16, 0.16);
}

function drawShards(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.fillStyle = 'rgba(31,111,120,0.35)';
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
}

function plank(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  top: string,
  bottom: string,
  stroke: string,
  radius: number,
): void {
  const gradient = ctx.createLinearGradient(0, h / 2, 0, -h / 2);
  gradient.addColorStop(0, top);
  gradient.addColorStop(1, bottom);
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, Math.min(radius, w / 2, h / 2));
  ctx.fillStyle = gradient;
  ctx.fill();
  ctx.strokeStyle = stroke;
  ctx.stroke();
}

function shadow(ctx: CanvasRenderingContext2D, w: number, h: number): void {
  ctx.save();
  ctx.translate(0.06, -0.1);
  ctx.fillStyle = 'rgba(48, 24, 12, 0.16)';
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, 0.08);
  ctx.fill();
  ctx.translate(-0.02, 0.03);
  ctx.fillStyle = 'rgba(48, 24, 12, 0.08)';
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, 0.1);
  ctx.fill();
  ctx.restore();
}

/** Three glowing beads ride the predicted path so its direction reads without text. */
function travelBeads(ctx: CanvasRenderingContext2D, points: { x: number; y: number }[], time: number): void {
  if (points.length < 2) return;
  let total = 0;
  const lengths: number[] = [];
  for (let i = 1; i < points.length; i += 1) {
    const a = points[i - 1];
    const b = points[i];
    if (!a || !b) continue;
    const distance = Math.hypot(b.x - a.x, b.y - a.y);
    lengths.push(distance);
    total += distance;
  }
  if (total < 0.05) return;
  for (let bead = 0; bead < 3; bead += 1) {
    let dist = (time * 2.4 + (bead * total) / 3) % total;
    for (let i = 0; i < lengths.length; i += 1) {
      const length = lengths[i] ?? 0;
      if (dist > length) {
        dist -= length;
        continue;
      }
      const a = points[i];
      const b = points[i + 1];
      if (!a || !b) break;
      const t = length === 0 ? 0 : dist / length;
      const x = a.x + (b.x - a.x) * t;
      const y = a.y + (b.y - a.y) * t;
      const glow = ctx.createRadialGradient(x, y, 0, x, y, 0.22);
      glow.addColorStop(0, 'rgba(255, 248, 236, 0.95)');
      glow.addColorStop(0.4, 'rgba(234, 88, 12, 0.7)');
      glow.addColorStop(1, 'rgba(234, 88, 12, 0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(x, y, 0.22, 0, TAU);
      ctx.fill();
      break;
    }
  }
}

let grainCanvas: HTMLCanvasElement | null = null;

function grainPattern(ctx: CanvasRenderingContext2D): CanvasPattern | null {
  if (!grainCanvas) {
    grainCanvas = document.createElement('canvas');
    grainCanvas.width = 128;
    grainCanvas.height = 128;
    const grain = grainCanvas.getContext('2d');
    if (!grain) return null;
    const image = grain.createImageData(128, 128);
    let seed = 214013;
    for (let i = 0; i < image.data.length; i += 4) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const value = seed & 255;
      image.data[i] = value;
      image.data[i + 1] = value;
      image.data[i + 2] = value;
      image.data[i + 3] = 255;
    }
    grain.putImageData(image, 0, 0);
  }
  return ctx.createPattern(grainCanvas, 'repeat');
}

function field(ctx: CanvasRenderingContext2D, w: number, h: number, fill: string, stroke: string): void {
  ctx.beginPath();
  ctx.roundRect(-w / 2, -h / 2, w, h, 0.12);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.save();
  ctx.setLineDash([0.12, 0.08]);
  ctx.strokeStyle = stroke;
  ctx.stroke();
  ctx.restore();
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

function worldText(ctx: CanvasRenderingContext2D, text: string, size: number, color: string): void {
  ctx.save();
  ctx.scale(1, -1);
  ctx.fillStyle = color;
  ctx.font = `600 ${size}px Outfit, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, 0, size * 0.15);
  ctx.restore();
}

function strokePath(
  ctx: CanvasRenderingContext2D,
  points: { x: number; y: number }[],
  color: string,
  width: number,
  dash?: number[],
  dashOffset = 0,
): void {
  if (points.length < 2) return;
  ctx.beginPath();
  const first = points[0];
  if (!first) return;
  ctx.moveTo(first.x, first.y);
  for (let i = 1; i < points.length; i += 1) {
    const point = points[i];
    if (point) ctx.lineTo(point.x, point.y);
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

function hexAlpha(hex: string, alpha: number): string {
  const value = hex.replace('#', '');
  if (value.length !== 6) return `rgba(234,88,12,${alpha})`;
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
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
