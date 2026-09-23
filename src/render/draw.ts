import type { BallStart, Goal, Level, Piece } from '../core/types';
import type { Particle, Guide } from '../game/session';
import { piecePose } from '../physics/sim';
import type { SimState } from '../physics/sim';
import { BALL_R } from '../physics/sim';
import type { Camera } from './camera';

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
}

const TAU = Math.PI * 2;

export function drawWorld(ctx: CanvasRenderingContext2D, input: DrawWorld): void {
  const { width, height, dpr, camera } = input;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  paintPaper(ctx, width, height, input.highContrast, input.time, input.reducedMotion);

  ctx.save();
  if (!input.reducedMotion && input.shake > 0) {
    ctx.translate(Math.sin(input.time * 42) * input.shake * 4, Math.cos(input.time * 36) * input.shake * 3);
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
    strokePath(ctx, path, 'rgba(27,36,48,0.14)', px(camera, 7));
    strokePath(ctx, path, 'rgba(27,36,48,0.62)', px(camera, 2), [0.14, 0.1]);
  }
  for (const path of input.preview) {
    strokePath(ctx, path, 'rgba(234,88,12,0.22)', px(camera, 9));
    strokePath(ctx, path, 'rgba(234,88,12,0.95)', px(camera, 2.2), [0.16, 0.1]);
    const last = path[path.length - 1];
    if (last) {
      ctx.beginPath();
      ctx.arc(last.x, last.y, 0.07, 0, TAU);
      ctx.fillStyle = '#EA580C';
      ctx.fill();
    }
    if (!input.reducedMotion && !input.highContrast) travelBead(ctx, path, input.time);
  }
  for (const path of input.trail) {
    strokePath(ctx, path, 'rgba(234,88,12,0.2)', px(camera, 8));
    strokePath(ctx, path, 'rgba(255,186,120,0.9)', px(camera, 2.2));
  }

  const latched = input.sim?.latched ?? [];
  const broken = input.sim?.broken ?? [];
  const anim = input.reducedMotion ? 0 : input.time;
  const all = [...input.level.environment, ...input.pieces, ...(input.hover ? [input.hover] : [])];
  for (const piece of input.level.environment) drawPiece(ctx, input, piece, false, latched, broken, anim, all);
  for (const piece of input.pieces) drawPiece(ctx, input, piece, true, latched, broken, anim, all);
  if (input.hover) {
    ctx.save();
    ctx.globalAlpha = input.hoverOk ? 0.5 : 0.22;
    drawPiece(ctx, input, input.hover, true, latched, broken, anim, all);
    ctx.restore();
    if (!input.hoverOk) {
      const pose = piecePose(input.hover, input.sim?.t ?? 0, latched, broken);
      ctx.save();
      ctx.translate(pose.x, pose.y);
      ctx.rotate(pose.rot);
      ctx.strokeStyle = '#9F1239';
      ctx.lineWidth = px(camera, 2);
      ctx.strokeRect(-input.hover.w / 2, -input.hover.h / 2, input.hover.w, input.hover.h);
      ctx.restore();
    }
  }

  const met = new Set(input.sim?.goalsMet ?? []);
  for (const goal of input.goals) {
    drawGoal(ctx, input, goal, met.has(goal.id), input.selected.includes(`goal:${goal.id}`));
  }
  drawGuides(ctx, input);
  drawBalls(ctx, input);
  for (const particle of input.particles) {
    const alpha = Math.max(0, particle.life / particle.max);
    ctx.fillStyle = particle.color;
    ctx.globalAlpha = alpha * 0.28;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, 0.16, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(particle.x, particle.y, 0.048, 0, TAU);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

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
    const pose = piecePose(piece, input.sim?.t ?? 0, latched, broken);
    ctx.save();
    ctx.translate(pose.x, pose.y);
    ctx.rotate(pose.rot);
    ctx.strokeStyle = '#1B2430';
    ctx.lineWidth = px(camera, 1.6);
    ctx.setLineDash([px(camera, 6), px(camera, 4)]);
    ctx.strokeRect(-piece.w / 2 - 0.08, -piece.h / 2 - 0.08, piece.w + 0.16, piece.h + 0.16);
    ctx.restore();
  }
  ctx.restore();

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

function drawTable(ctx: CanvasRenderingContext2D, input: DrawWorld): void {
  if (input.highContrast) return;
  const { view } = input.level;
  ctx.save();
  ctx.fillStyle = 'rgba(255, 250, 242, 0.55)';
  ctx.beginPath();
  ctx.roundRect(view.x - 0.15, view.y - 0.15, view.w + 0.3, view.h + 0.3, 0.4);
  ctx.fill();
  ctx.restore();
}

function drawGrid(ctx: CanvasRenderingContext2D, input: DrawWorld): void {
  const { view } = input.level;
  const minor = input.camera.zoom > 36;
  ctx.save();
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
  ctx.strokeStyle = input.highContrast ? 'rgba(0,0,0,0.18)' : 'rgba(92, 58, 30, 0.09)';
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
  ctx.strokeStyle = input.highContrast ? 'rgba(0,0,0,0.28)' : 'rgba(92, 58, 30, 0.16)';
  ctx.lineWidth = px(input.camera, 1.25);
  ctx.stroke();
  ctx.restore();
}

function drawKill(ctx: CanvasRenderingContext2D, input: DrawWorld): void {
  const { view } = input.level;
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(view.x, input.level.killY);
  ctx.lineTo(view.x + view.w, input.level.killY);
  if (!input.highContrast) {
    ctx.strokeStyle = 'rgba(159,18,57,0.18)';
    ctx.lineWidth = px(input.camera, 8);
    ctx.stroke();
  }
  ctx.strokeStyle = input.highContrast ? '#9F1239' : 'rgba(159,18,57,0.7)';
  ctx.lineWidth = px(input.camera, 1.5);
  ctx.setLineDash([0.16, 0.12]);
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

function drawBalls(ctx: CanvasRenderingContext2D, input: DrawWorld): void {
  if (input.mode === 'run' && input.sim) {
    const many = input.sim.balls.length > 1;
    for (const ball of input.sim.balls) {
      if (!ball.alive && ball.y < input.level.killY) continue;
      drawBall(ctx, ball.x, ball.y, ball.r, ball.vx, ball.vy, input.reducedMotion, many ? ball.id.toUpperCase() : undefined);
    }
    return;
  }
  const many = input.starts.length > 1;
  for (const start of input.starts) {
    const selected = input.selected.includes(`start:${start.id}`);
    if (selected) {
      ctx.beginPath();
      ctx.arc(start.x, start.y, (start.r ?? BALL_R) + 0.12, 0, TAU);
      ctx.strokeStyle = '#1B2430';
      ctx.lineWidth = px(input.camera, 1.5);
      ctx.stroke();
    }
    drawBall(ctx, start.x, start.y, start.r ?? BALL_R, 0, 0, true, many ? start.id.toUpperCase() : undefined);
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
  if (!reduced && speed > 1.4) {
    const nx = vx / speed;
    const ny = vy / speed;
    const tail = r * (1.1 + Math.min(speed, 14) * 0.11);
    ctx.strokeStyle = 'rgba(234, 88, 12, 0.38)';
    ctx.lineWidth = r * 0.7;
    ctx.beginPath();
    ctx.moveTo(-nx * tail, -ny * tail);
    ctx.lineTo(0, 0);
    ctx.stroke();
  }
  if (!reduced && speed > 1) {
    const angle = Math.atan2(vy, vx);
    const squash = Math.min(0.16, speed / 22);
    ctx.rotate(angle);
    ctx.scale(1 + squash, 1 - squash * 0.75);
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
  ctx.beginPath();
  ctx.arc(-r * 0.28, r * 0.32, r * 0.22, 0, TAU);
  ctx.fillStyle = 'rgba(255, 248, 236, 0.92)';
  ctx.fill();
  if (letter) worldText(ctx, letter, r * 0.7, '#F4F1EA');
  ctx.restore();
}

function drawGoal(ctx: CanvasRenderingContext2D, input: DrawWorld, goal: Goal, met: boolean, selected: boolean): void {
  const color = met ? '#0F766E' : input.accent;
  const breathe = input.reducedMotion ? 0 : Math.sin(input.time * 2.4);
  ctx.save();
  ctx.translate(goal.x, goal.y);
  if (!input.highContrast) {
    const glow = ctx.createRadialGradient(0, 0, goal.r * 0.2, 0, 0, goal.r * (met ? 1.9 : 1.65));
    glow.addColorStop(0, met ? 'rgba(15,118,110,0.34)' : 'rgba(234,88,12,0.32)');
    glow.addColorStop(1, 'rgba(234,88,12,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, goal.r * 1.7, 0, TAU);
    ctx.fill();
    if (!input.reducedMotion) {
      const wave = (input.time * 0.32) % 1;
      ctx.globalAlpha = (1 - wave) * 0.55;
      ctx.strokeStyle = color;
      ctx.lineWidth = px(input.camera, 1.5);
      ctx.beginPath();
      ctx.arc(0, 0, goal.r * (1.05 + wave * 0.45), 0, TAU);
      ctx.stroke();
      ctx.globalAlpha = 1;
    }
  }
  ctx.lineWidth = px(input.camera, input.highContrast ? 3 : 2.4);
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.arc(0, 0, goal.r * (1 + breathe * 0.018), 0, TAU);
  ctx.stroke();
  ctx.globalAlpha = 0.8;
  ctx.beginPath();
  ctx.arc(0, 0, goal.r * 0.62, 0, TAU);
  ctx.stroke();
  ctx.globalAlpha = 1;
  const d = Math.min(0.22, goal.r * 0.28) * (1 + breathe * 0.06);
  ctx.beginPath();
  ctx.moveTo(0, d);
  ctx.lineTo(d * 0.72, 0);
  ctx.lineTo(0, -d);
  ctx.lineTo(-d * 0.72, 0);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
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
  ctx.save();
  ctx.translate(pose.x, pose.y);
  ctx.rotate(pose.rot);
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
  if (piece.kind !== 'gravity' && piece.kind !== 'accelerator' && piece.kind !== 'portal' && piece.kind !== 'switch') {
    shadow(ctx, piece.w, piece.h);
  }
  drawBody(ctx, piece, pose.inactive, latched.includes(piece.uid), anim, input.camera, all);
  if (owned) {
    ctx.fillStyle = '#EA580C';
    ctx.fillRect(piece.w / 2 - 0.14, -piece.h / 2, 0.1, 0.1);
  }
  ctx.restore();
}

function drawBody(
  ctx: CanvasRenderingContext2D,
  piece: Piece,
  inactive: boolean,
  latched: boolean,
  anim: number,
  camera: Camera,
  all: Piece[],
): void {
  const { w, h, kind } = piece;
  if (kind === 'wall') {
    plank(ctx, w, h, '#D5DEE6', '#6E8498', '#243140', 0.06);
    return;
  }
  if (kind === 'platform' || kind === 'ramp' || kind === 'mover' || kind === 'spinner') {
    plank(ctx, w, h, '#F0D7A8', '#C8883A', '#5C3A1E', 0.07);
    ctx.strokeStyle = 'rgba(92,58,30,0.35)';
    ctx.lineWidth = px(camera, 1);
    ctx.beginPath();
    ctx.moveTo(-w * 0.35, 0);
    ctx.lineTo(w * 0.35, 0);
    ctx.stroke();
    if (kind === 'mover') arrowHead(ctx, w * 0.28, 0, Math.min(0.16, h), '#5C3A1E');
    if (kind === 'spinner') {
      ctx.beginPath();
      ctx.arc(0, 0, Math.min(w, h) * 0.28, 0, TAU);
      ctx.fillStyle = '#5C3A1E';
      ctx.fill();
    }
    return;
  }
  if (kind === 'oneway') {
    plank(ctx, w, h, '#F0D7A8', '#C8883A', '#5C3A1E', 0.05);
    chevrons(ctx, w * 0.55, 'y', 3, '#5C3A1E');
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
    arrowHead(ctx, w * 0.38, 0, 0.12, '#EA580C');
    return;
  }
  if (kind === 'breakable') {
    plank(ctx, w, h, '#E7F4F6', '#B7D4D8', '#1F6F78', 0.05);
    ctx.strokeStyle = '#1F6F78';
    ctx.lineWidth = px(camera, 1.2);
    ctx.beginPath();
    ctx.moveTo(-w * 0.2, h * 0.3);
    ctx.lineTo(-w * 0.02, 0);
    ctx.lineTo(w * 0.08, h * 0.1);
    ctx.lineTo(w * 0.22, -h * 0.28);
    ctx.stroke();
    return;
  }
  if (kind === 'bouncer') {
    plank(ctx, w, h, '#2C3540', '#1B2430', '#1B2430', 0.08);
    ctx.fillStyle = '#EA580C';
    ctx.fillRect(-w / 2 + 0.08, h / 2 - 0.1, w - 0.16, 0.08);
    return;
  }
  if (kind === 'spring') {
    plank(ctx, w, Math.min(h, 0.16), '#E7C7A2', '#C47A3A', '#5C3A1E', 0.04);
    ctx.strokeStyle = '#C45C12';
    ctx.lineWidth = px(camera, 2.4);
    ctx.beginPath();
    const coils = 4;
    for (let i = 0; i <= 32; i += 1) {
      const t = i / 32;
      const x = -w / 2 + 0.08 + t * (w - 0.16);
      const y = Math.sin(t * coils * TAU) * h * 0.28;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
    arrowHead(ctx, w / 2 + 0.02, 0, 0.14, '#C45C12');
    return;
  }
  if (kind === 'cannon') {
    plank(ctx, w * 0.78, h * 0.7, '#D5DEE6', '#6E8498', '#243140', 0.08);
    ctx.beginPath();
    ctx.arc(w * 0.28, 0, h * 0.28, 0, TAU);
    ctx.fillStyle = '#1B2430';
    ctx.fill();
    arrowHead(ctx, w / 2, 0, 0.16, '#EA580C');
    return;
  }
  if (kind === 'accelerator') {
    field(ctx, w, h, 'rgba(234,88,12,0.14)', '#EA580C');
    chevrons(ctx, w * 0.55, 'x', 3, '#C2410C');
    return;
  }
  if (kind === 'gravity') {
    field(ctx, w, h, 'rgba(109,40,217,0.1)', '#6D28D9');
    arrowHead(ctx, w * 0.28, 0, Math.min(0.28, h * 0.18), '#6D28D9');
    ctx.fillStyle = '#6D28D9';
    for (let i = 0; i < 4; i += 1) {
      const t = ((anim * 0.35 + i * 0.25) % 1);
      ctx.globalAlpha = 1 - t;
      ctx.beginPath();
      ctx.arc(-w * 0.3 + t * w * 0.7, ((i % 2) - 0.5) * h * 0.3, 0.06, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    return;
  }
  if (kind === 'portal') {
    const color = linkColor(piece.props.link ?? piece.uid);
    ctx.fillStyle = 'rgba(244,241,234,0.92)';
    ctx.strokeStyle = color;
    ctx.lineWidth = px(camera, 3);
    ctx.beginPath();
    ctx.roundRect(-w / 2, -h / 2, w, h, Math.min(w, h) * 0.4);
    ctx.fill();
    ctx.stroke();
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
    ctx.beginPath();
    ctx.arc(0, h * 0.12, latched || inactive ? h * 0.16 : h * 0.24, 0, TAU);
    ctx.fillStyle = latched || inactive ? '#0F766E' : '#EA580C';
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
  gradient.addColorStop(0, bottom);
  gradient.addColorStop(1, top);
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

function travelBead(ctx: CanvasRenderingContext2D, points: { x: number; y: number }[], time: number): void {
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
  let dist = (time * 2.2) % total;
  for (let i = 0; i < lengths.length; i += 1) {
    const length = lengths[i] ?? 0;
    if (dist > length) {
      dist -= length;
      continue;
    }
    const a = points[i];
    const b = points[i + 1];
    if (!a || !b) return;
    const t = length === 0 ? 0 : dist / length;
    const x = a.x + (b.x - a.x) * t;
    const y = a.y + (b.y - a.y) * t;
    const glow = ctx.createRadialGradient(x, y, 0, x, y, 0.24);
    glow.addColorStop(0, 'rgba(255, 248, 236, 0.95)');
    glow.addColorStop(0.4, 'rgba(234, 88, 12, 0.75)');
    glow.addColorStop(1, 'rgba(234, 88, 12, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y, 0.24, 0, TAU);
    ctx.fill();
    return;
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
  ctx.stroke();
  ctx.setLineDash([]);
}

function linkColor(link: string): string {
  const colors = ['#EA580C', '#0F766E', '#1D4ED8', '#BE185D'];
  let hash = 0;
  for (let i = 0; i < link.length; i += 1) hash = (hash * 33 + link.charCodeAt(i)) >>> 0;
  return colors[hash % colors.length] ?? '#EA580C';
}

function px(camera: Camera, pixels: number): number {
  return pixels / Math.max(camera.zoom, 1);
}
