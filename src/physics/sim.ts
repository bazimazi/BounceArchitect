import { dirOf, len, upOf } from '../core/math';
import { isSolid, type Goal, type Level, type Piece } from '../core/types';
import { circleObb } from './collide';
import { materialOf } from './material';

export const FIXED_DT = 1 / 120;
export const BALL_R = 0.32;
export const MAX_SPEED = 24;
const SLOP = 0.004;
const SLEEP_SPEED = 0.22;
const SLEEP_TIME = 1.15;
const REST_INCOMING = 0.85;

export interface SimBall {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  alive: boolean;
  ignore: Record<string, number>;
}

export interface SimEvent {
  t: number;
  kind: 'bounce' | 'spring' | 'portal' | 'switch' | 'cannon' | 'break' | 'goal';
  x: number;
  y: number;
  note?: string;
}

export interface Sample {
  t: number;
  balls: { id: string; x: number; y: number }[];
}

export interface SimState {
  t: number;
  balls: SimBall[];
  latched: string[];
  broken: string[];
  touching: string[];
  phase: 'running' | 'won' | 'lost';
  reason: string;
  events: SimEvent[];
  sleep: number;
  closest: number;
  maxSpeed: number;
  goalsMet: string[];
}

export interface SimLevel {
  gravity: number;
  maxTime: number;
  killY: number;
  goals: Goal[];
  pieces: Piece[];
  starts: { id: string; x: number; y: number; r?: number }[];
}

export interface PiecePose {
  x: number;
  y: number;
  rot: number;
  vx: number;
  vy: number;
  omega: number;
  inactive: boolean;
}

export function toSim(level: Level, player: Piece[]): SimLevel {
  return {
    gravity: level.gravity,
    maxTime: level.maxTime,
    killY: level.killY,
    goals: level.goals,
    pieces: [...level.environment, ...player],
    starts: level.starts,
  };
}

export function createState(level: SimLevel): SimState {
  return {
    t: 0,
    balls: level.starts.map((s) => ({
      id: s.id,
      x: s.x,
      y: s.y,
      vx: 0,
      vy: 0,
      r: s.r ?? BALL_R,
      alive: true,
      ignore: {},
    })),
    latched: [],
    broken: [],
    touching: [],
    phase: 'running',
    reason: '',
    events: [],
    sleep: 0,
    closest: Infinity,
    maxSpeed: 0,
    goalsMet: [],
  };
}

export function step(level: SimLevel, state: SimState): void {
  if (state.phase === 'lost') return;
  const dt = FIXED_DT;
  state.t += dt;
  const poses = computePoses(level, state);
  const nextTouch: string[] = [];
  const seen = new Set(state.touching);
  let anyFast = false;

  for (const ball of state.balls) {
    if (!ball.alive) continue;
    for (const key of Object.keys(ball.ignore)) {
      if (ball.ignore[key]! <= state.t) delete ball.ignore[key];
    }

    const speed = len(ball.vx, ball.vy);
    let sub = 1;
    while (speed * (dt / sub) > ball.r * 0.35 && sub < 4) sub += 1;
    const h = dt / sub;
    for (let s = 0; s < sub; s += 1) {
      const g = gravityFor(level, poses, ball);
      ball.vx += g.x * h;
      ball.vy += g.y * h;
      applyAccelerators(level, poses, ball, h);
      ball.x += ball.vx * h;
      ball.y += ball.vy * h;
      resolveSolids(level, poses, state, ball, g, h);
      sense(level, poses, state, ball, nextTouch, seen);
    }

    clampSpeed(ball);
    const sp = len(ball.vx, ball.vy);
    state.maxSpeed = Math.max(state.maxSpeed, sp);
    if (sp > SLEEP_SPEED) anyFast = true;
    if (ball.y < level.killY) ball.alive = false;
  }

  state.touching = nextTouch;
  updateGoals(level, state);
  if (state.phase === 'won') return;

  if (state.balls.some((b) => !b.alive)) {
    fail(state, 'The ball fell out of reach.');
    return;
  }
  if (state.t > level.maxTime) {
    fail(state, 'Time ran out before the ball arrived.');
    return;
  }
  state.sleep = anyFast ? 0 : state.sleep + dt;
  if (state.sleep > SLEEP_TIME) fail(state, explainSettle(level, state));
}

function fail(state: SimState, reason: string): void {
  state.phase = 'lost';
  state.reason = reason;
}

function explainSettle(level: SimLevel, state: SimState): string {
  const switches = level.pieces.filter((p) => p.kind === 'switch');
  if (switches.length > 0 && switches.some((s) => !state.latched.includes(s.uid))) {
    return switches.length > 1 ? 'A switch never flipped.' : 'The switch never flipped.';
  }
  if (state.maxSpeed < 1.05) return 'The ball never really got moving.';
  if (state.closest < 1.35) return 'It came close to the ring, then ran out of speed.';
  return 'The ball lost its momentum.';
}

function updateGoals(level: SimLevel, state: SimState): void {
  for (const goal of level.goals) {
    if (state.goalsMet.includes(goal.id)) continue;
    for (const ball of state.balls) {
      if (!ball.alive) continue;
      if (goal.ballId && goal.ballId !== ball.id) continue;
      const d = Math.hypot(ball.x - goal.x, ball.y - goal.y);
      state.closest = Math.min(state.closest, d);
      if (d <= goal.r) {
        state.goalsMet.push(goal.id);
        pushEvent(state, { t: state.t, kind: 'goal', x: ball.x, y: ball.y });
        ball.vx *= 0.4;
        ball.vy *= 0.4;
      }
    }
  }
  if (level.goals.length > 0 && level.goals.every((g) => state.goalsMet.includes(g.id))) {
    state.phase = 'won';
    state.reason = '';
  }
}

function pushEvent(state: SimState, event: SimEvent): void {
  if (state.events.length > 48) state.events.shift();
  state.events.push(event);
}

export function piecePose(piece: Piece, t: number, latched: readonly string[], broken: readonly string[]): PiecePose {
  const pose: PiecePose = {
    x: piece.x,
    y: piece.y,
    rot: piece.rot,
    vx: 0,
    vy: 0,
    omega: 0,
    inactive: broken.includes(piece.uid),
  };
  if (piece.kind === 'mover' && !pose.inactive) {
    const period = Math.max(0.4, piece.props.period ?? 3);
    const distance = piece.props.distance ?? 2;
    const ang = (Math.PI * 2 * t) / period;
    const offset = Math.sin(ang) * (distance / 2);
    const d = dirOf(piece.rot);
    pose.x = piece.x + d.x * offset;
    pose.y = piece.y + d.y * offset;
    const vel = (distance / 2) * Math.cos(ang) * ((Math.PI * 2) / period);
    pose.vx = d.x * vel;
    pose.vy = d.y * vel;
  } else if (piece.kind === 'spinner' && !pose.inactive) {
    const omega = piece.props.omega ?? 1;
    pose.omega = omega;
    pose.rot = piece.rot + omega * t;
  } else if (piece.kind === 'door' && piece.props.gate && latched.includes(piece.props.gate)) {
    pose.inactive = true;
  }
  return pose;
}

function computePoses(level: SimLevel, state: SimState): Map<string, PiecePose> {
  const map = new Map<string, PiecePose>();
  for (const piece of level.pieces) map.set(piece.uid, piecePose(piece, state.t, state.latched, state.broken));
  return map;
}

function gravityFor(level: SimLevel, poses: Map<string, PiecePose>, ball: SimBall): { x: number; y: number } {
  let g = { x: 0, y: -level.gravity };
  for (const piece of level.pieces) {
    if (piece.kind !== 'gravity') continue;
    const pose = poses.get(piece.uid);
    if (!pose || pose.inactive || !overlaps(ball, piece, pose)) continue;
    const d = dirOf(pose.rot);
    const power = piece.props.power ?? level.gravity;
    g = { x: d.x * power, y: d.y * power };
  }
  return g;
}

function applyAccelerators(level: SimLevel, poses: Map<string, PiecePose>, ball: SimBall, dt: number): void {
  for (const piece of level.pieces) {
    if (piece.kind !== 'accelerator') continue;
    const pose = poses.get(piece.uid);
    if (!pose || !overlaps(ball, piece, pose)) continue;
    const d = dirOf(pose.rot);
    ball.vx += d.x * (piece.props.power ?? 24) * dt;
    ball.vy += d.y * (piece.props.power ?? 24) * dt;
    const cap = piece.props.max ?? 13;
    const sp = len(ball.vx, ball.vy);
    if (sp > cap) {
      ball.vx *= cap / sp;
      ball.vy *= cap / sp;
    }
  }
}

function resolveSolids(
  level: SimLevel,
  poses: Map<string, PiecePose>,
  state: SimState,
  ball: SimBall,
  g: { x: number; y: number },
  dt: number,
): void {
  let frictionUsed = false;
  for (let iter = 0; iter < 8; iter += 1) {
    let bestPen = 0.0008;
    let best: { piece: Piece; pose: PiecePose; nx: number; ny: number; pen: number } | null = null;
    for (const piece of level.pieces) {
      if (!isSolid(piece.kind)) continue;
      const pose = poses.get(piece.uid);
      if (!pose || pose.inactive) continue;
      const hit = circleObb(ball.x, ball.y, ball.r, pose.x, pose.y, piece.w / 2, piece.h / 2, pose.rot);
      if (!hit || hit.pen <= bestPen) continue;
      if (piece.kind === 'oneway' && !oneWayBlocks(ball, pose, piece)) continue;
      bestPen = hit.pen;
      best = { piece, pose, nx: hit.nx, ny: hit.ny, pen: hit.pen };
    }
    if (!best) break;

    const { piece, pose, nx, ny, pen } = best;
    if (pen > SLOP) {
      ball.x += nx * Math.min(pen - SLOP, 0.2);
      ball.y += ny * Math.min(pen - SLOP, 0.2);
    }

    let sv = surfaceVelocity(pose, ball, nx, ny);
    if (piece.kind === 'conveyor') {
      const d = dirOf(pose.rot);
      const power = piece.props.power ?? 3.5;
      sv = { x: sv.x + d.x * power, y: sv.y + d.y * power };
    }

    const relN = (ball.vx - sv.x) * nx + (ball.vy - sv.y) * ny;
    if (piece.kind === 'breakable' && -relN > (piece.props.threshold ?? 6)) {
      state.broken.push(piece.uid);
      pose.inactive = true;
      pushEvent(state, { t: state.t, kind: 'break', x: ball.x, y: ball.y });
      continue;
    }

    const frict = () => {
      if (frictionUsed) return;
      frictionUsed = true;
      applyFriction(ball, nx, ny, sv, materialOf(piece).friction, g, dt);
    };
    if (piece.kind === 'bouncer' && relN < -0.25) {
      const power = piece.props.power ?? 9;
      const vn = ball.vx * nx + ball.vy * ny;
      ball.vx += (power - vn) * nx;
      ball.vy += (power - vn) * ny;
      pushEvent(state, { t: state.t, kind: 'bounce', x: ball.x, y: ball.y, note: 'bouncer' });
    } else if (relN < 0) {
      const incoming = -relN;
      const mat = materialOf(piece);
      const e = incoming < REST_INCOMING ? 0 : mat.restitution;
      ball.vx += -(1 + e) * relN * nx;
      ball.vy += -(1 + e) * relN * ny;
      if (incoming > 2.4) pushEvent(state, { t: state.t, kind: 'bounce', x: ball.x, y: ball.y });
      frict();
    } else {
      frict();
    }
  }
}

/** A one-way plank is solid only once the ball is above it and no longer rising through. */
function oneWayBlocks(ball: SimBall, pose: PiecePose, piece: Piece): boolean {
  const up = upOf(pose.rot);
  const side = (ball.x - pose.x) * up.x + (ball.y - pose.y) * up.y;
  const top = piece.h / 2;
  if (side < top + ball.r * 0.2) return false;
  const relUp = (ball.vx - pose.vx) * up.x + (ball.vy - pose.vy) * up.y;
  return relUp < 0.45;
}

function surfaceVelocity(pose: PiecePose, ball: SimBall, nx: number, ny: number): { x: number; y: number } {
  if (pose.omega !== 0) {
    const rx = ball.x - nx * ball.r - pose.x;
    const ry = ball.y - ny * ball.r - pose.y;
    return { x: -pose.omega * ry + pose.vx, y: pose.omega * rx + pose.vy };
  }
  return { x: pose.vx, y: pose.vy };
}

function applyFriction(
  ball: SimBall,
  nx: number,
  ny: number,
  sv: { x: number; y: number },
  mu: number,
  g: { x: number; y: number },
  dt: number,
): void {
  const gn = g.x * nx + g.y * ny;
  const gtx = g.x - gn * nx;
  const gty = g.y - gn * ny;
  const rvx = ball.vx - sv.x;
  const rvy = ball.vy - sv.y;
  const relN = rvx * nx + rvy * ny;
  const tvx = rvx - relN * nx;
  const tvy = rvy - relN * ny;
  const ts = Math.hypot(tvx, tvy);
  const fAcc = mu * Math.abs(gn);
  if (ts < 0.06) {
    const gt = Math.hypot(gtx, gty);
    if (gt <= fAcc + 0.05) {
      ball.vx -= tvx;
      ball.vy -= tvy;
      ball.vx -= gtx * dt;
      ball.vy -= gty * dt;
      return;
    }
  }
  if (ts > 1e-6) {
    const drop = Math.min(ts, fAcc * dt);
    ball.vx -= (tvx / ts) * drop;
    ball.vy -= (tvy / ts) * drop;
  }
}

function sense(
  level: SimLevel,
  poses: Map<string, PiecePose>,
  state: SimState,
  ball: SimBall,
  nextTouch: string[],
  seen: Set<string>,
): void {
  for (const piece of level.pieces) {
    if (piece.kind !== 'spring' && piece.kind !== 'portal' && piece.kind !== 'cannon' && piece.kind !== 'switch') {
      continue;
    }
    const pose = poses.get(piece.uid);
    if (!pose || pose.inactive || !overlaps(ball, piece, pose)) continue;
    const key = `${ball.id}:${piece.uid}`;
    nextTouch.push(key);
    if (seen.has(key) || ball.ignore[piece.uid]) continue;
    seen.add(key);

    if (piece.kind === 'spring') fireLauncher(ball, piece, pose, state, 'spring');
    else if (piece.kind === 'cannon') fireLauncher(ball, piece, pose, state, 'cannon');
    else if (piece.kind === 'switch') {
      if (!state.latched.includes(piece.uid)) {
        state.latched.push(piece.uid);
        pushEvent(state, { t: state.t, kind: 'switch', x: piece.x, y: piece.y });
      }
    } else if (piece.kind === 'portal') {
      const twin = level.pieces.find(
        (p) => p.kind === 'portal' && p.props.link === piece.props.link && p.uid !== piece.uid,
      );
      if (!twin) continue;
      const twinPose = poses.get(twin.uid);
      if (!twinPose) continue;
      const delta = twinPose.rot - pose.rot;
      const c = Math.cos(delta);
      const s = Math.sin(delta);
      const vx = ball.vx;
      const vy = ball.vy;
      ball.vx = vx * c - vy * s;
      ball.vy = vx * s + vy * c;
      const d = dirOf(twinPose.rot);
      ball.x = twinPose.x + d.x * (twin.w / 2 + ball.r + 0.06);
      ball.y = twinPose.y + d.y * (twin.w / 2 + ball.r + 0.06);
      ball.ignore[piece.uid] = state.t + 0.35;
      ball.ignore[twin.uid] = state.t + 0.35;
      pushEvent(state, { t: state.t, kind: 'portal', x: ball.x, y: ball.y });
    }
  }
}

function fireLauncher(
  ball: SimBall,
  piece: Piece,
  pose: PiecePose,
  state: SimState,
  kind: 'spring' | 'cannon',
): void {
  const d = dirOf(pose.rot);
  const power = piece.props.power ?? (kind === 'cannon' ? 15 : 12);
  const along = ball.vx * d.x + ball.vy * d.y;
  if (along > power * 0.55) return;
  ball.vx = d.x * power;
  ball.vy = d.y * power;
  ball.x = pose.x + d.x * (piece.w / 2 + ball.r + 0.03);
  ball.y = pose.y + d.y * (piece.w / 2 + ball.r + 0.03);
  pushEvent(state, { t: state.t, kind, x: ball.x, y: ball.y });
}

function overlaps(ball: SimBall, piece: Piece, pose: PiecePose): boolean {
  return circleObb(ball.x, ball.y, ball.r, pose.x, pose.y, piece.w / 2, piece.h / 2, pose.rot) !== null;
}

function clampSpeed(ball: SimBall): void {
  const sp = len(ball.vx, ball.vy);
  if (sp > MAX_SPEED) {
    ball.vx *= MAX_SPEED / sp;
    ball.vy *= MAX_SPEED / sp;
  }
}

export interface RunResult extends SimState {
  samples: Sample[];
}

export function run(level: SimLevel, seconds: number): RunResult {
  const state = createState(level);
  const samples: Sample[] = [];
  const steps = Math.max(1, Math.round(seconds / FIXED_DT));
  let wonAt = -1;
  for (let i = 0; i < steps; i += 1) {
    step(level, state);
    if (i % 4 === 0) {
      samples.push({
        t: state.t,
        balls: state.balls.map((b) => ({ id: b.id, x: b.x, y: b.y })),
      });
    }
    if (state.phase === 'lost') break;
    if (state.phase === 'won' && wonAt < 0) wonAt = state.t;
    if (wonAt > 0 && state.t - wonAt > 0.4) break;
  }
  return { ...state, samples };
}

export function previewPoints(level: SimLevel, seconds: number): { x: number; y: number }[] {
  return run(level, seconds).samples.map((s) => ({ x: s.balls[0]?.x ?? 0, y: s.balls[0]?.y ?? 0 }));
}
