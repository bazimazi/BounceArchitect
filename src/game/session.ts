import { snap, uid } from '../core/math';
import type { Allowance, BallStart, Goal, Level, Piece } from '../core/types';
import { CATALOG } from '../level/catalog';
import { allowanceIndex, remaining, sameAllowance } from '../editor/budget';
import { cloneBoard, History, type BoardState } from '../editor/history';
import { scoreAttempt, type Medals } from '../progress/medals';
import { pointInObb } from '../physics/collide';
import { createState, FIXED_DT, run, step, toSim, type SimEvent, type SimState } from '../physics/sim';
import { fitCamera, screenToWorld, type Camera } from '../render/camera';

export type ParticleKind = 'dot' | 'spark' | 'ring' | 'shard' | 'confetti' | 'puff';

export interface Particle {
  kind: ParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
  size: number;
  rot: number;
  spin: number;
  gravity: number;
  drag: number;
}

/** Presentation state for one ball. Never feeds back into the simulation. */
export interface BallFx {
  spin: number;
  amp: number;
  age: number;
  nx: number;
  ny: number;
}

/** Everything the renderer animates that the simulation does not own. */
export interface RenderFx {
  balls: Map<string, BallFx>;
  /** Seconds since a piece last reacted to the ball. */
  pulses: Map<string, number>;
  /** Seconds since a piece was placed. */
  spawns: Map<string, number>;
  /** 0 while building, 1 while the ball runs. */
  modeBlend: number;
  /** 0 when the level has just opened, 1 once the iris is fully open. */
  iris: number;
  flash: { color: string; life: number; max: number } | null;
}

export function emptyFx(): RenderFx {
  return { balls: new Map(), pulses: new Map(), spawns: new Map(), modeBlend: 0, iris: 1, flash: null };
}

const CONFETTI = ['#EA580C', '#F59E0B', '#0F766E', '#1D4ED8', '#BE185D', '#6D28D9', '#FDE68A'];
/** Sim seconds before a predicted win when playback starts to slow. */
const SLOW_LEAD = 0.42;
const SLOW_SCALE = 0.3;

export interface Guide {
  axis: 'x' | 'y';
  at: number;
}

interface Drag {
  ids: string[];
  sx: number;
  sy: number;
  origin: Map<string, { x: number; y: number }>;
  moved: boolean;
  before: BoardState;
}

interface AnchorDrag {
  kind: 'goal' | 'start';
  id: string;
  sx: number;
  sy: number;
  ox: number;
  oy: number;
  moved: boolean;
  before: BoardState;
}

const SNAP_STEPS = [0.5, 0.25, 0.1, 0];

export class Session {
  readonly sandbox: boolean;
  level: Level;
  selected: string[] = [];
  tool: number | null = null;
  toolRot = 0;
  mode: 'build' | 'run' = 'build';
  paused = false;
  speed = 1;
  follow = false;
  snap = 0.25;
  sim: SimState | null = null;
  preview: { x: number; y: number }[][] = [];
  ghost: { x: number; y: number }[][] = [];
  showGhost = true;
  outcome: 'won' | 'lost' | null = null;
  toast = '';
  hintIndex = 0;
  attempts = 0;
  medals: Medals = { reach: false, lean: false, swift: false };
  pendingLink: string | null = null;
  hover: Piece | null = null;
  hoverOk = false;
  guides: Guide[] = [];
  particles: Particle[] = [];
  shake = 0;
  trail: { x: number; y: number }[][] = [];
  camera: Camera;
  reducedMotion = false;
  movedCamera = false;
  fx: RenderFx = emptyFx();
  /** 0 to 1. How far the camera leans in toward the ring for the finish. */
  punch = 0;
  private punchFocus = { x: 0, y: 0 };
  private winAt = -1;
  private hitStop = 0;
  private camTween: { from: Camera; to: Camera; t: number } | null = null;
  private inset = { top: 0, bottom: 0 };

  private history: History;
  private drag: Drag | null = null;
  private anchor: AnchorDrag | null = null;
  private previewDirty = true;
  private previewWait = 0;
  private acc = 0;
  private eventSeen = 0;
  private winHold = 0;
  private reported = false;
  private sounds: string[] = [];
  private pointer: { x: number; y: number } | null = null;
  private hoverKey = '';
  private trails = new Map<string, { x: number; y: number }[]>();
  viewW = 1280;
  viewH = 720;

  constructor(level: Level, options?: { sandbox?: boolean; attempts?: number; hints?: number }) {
    this.level = level;
    this.sandbox = Boolean(options?.sandbox);
    this.attempts = options?.attempts ?? 0;
    this.hintIndex = options?.hints ?? 0;
    this.history = new History({
      pieces: [],
      starts: structuredClone(level.starts),
      goals: structuredClone(level.goals),
    });
    this.camera = fitCamera(level.view, this.viewW, this.viewH);
    this.fx.iris = 0;
  }

  /** The camera the board is drawn with: the working camera, leaned in for a finish. */
  viewCamera(): Camera {
    if (this.punch <= 0.001) return this.camera;
    const ease = this.punch * this.punch * (3 - 2 * this.punch);
    return {
      x: this.camera.x + (this.punchFocus.x - this.camera.x) * ease * 0.55,
      y: this.camera.y + (this.punchFocus.y - this.camera.y) * ease * 0.55,
      zoom: this.camera.zoom * (1 + ease * 0.32),
    };
  }

  get pieces(): Piece[] {
    return this.history.current().pieces;
  }

  get starts(): BallStart[] {
    return this.history.current().starts;
  }

  get goals(): Goal[] {
    return this.history.current().goals;
  }

  get canUndo(): boolean {
    return this.history.canUndo;
  }

  get canRedo(): boolean {
    return this.history.canRedo;
  }

  get clock(): number {
    return this.sim?.t ?? 0;
  }

  selectTool(index: number | null): void {
    if (index !== null && this.mode === 'run') this.edit();
    if (index === null || this.tool === index) {
      this.tool = null;
      this.hover = null;
      this.markPreview();
      return;
    }
    const allowance = this.level.palette[index];
    if (!allowance) return;
    this.tool = index;
    this.toolRot = allowance.rot ?? 0;
    this.refreshHover();
  }

  setRotation(rot: number): void {
    this.toolRot = rot;
    this.refreshHover();
  }

  setSnap(step: number): void {
    this.snap = step;
  }

  cycleSnap(): void {
    const index = SNAP_STEPS.findIndex((step) => Math.abs(step - this.snap) < 0.001);
    this.snap = SNAP_STEPS[(index + 1) % SNAP_STEPS.length] ?? 0.25;
  }

  snapLabel(): string {
    if (this.snap === 0.5) return '1/2';
    if (this.snap === 0.25) return '1/4';
    if (Math.abs(this.snap - 0.1) < 0.001) return 'Fine';
    return 'Free';
  }

  placeAt(x: number, y: number): boolean {
    if (this.mode !== 'build' || this.tool === null) return false;
    const allowance = this.level.palette[this.tool];
    if (!allowance) return false;
    const point = this.snapPoint(x, y);
    if (!this.inside(point.x, point.y)) {
      this.toast = 'That sits outside the board.';
      return false;
    }
    const completing = allowance.kind === 'portal' && this.pendingLink !== null;
    if (!completing && remaining(this.pieces, this.level.palette, this.tool) <= 0) {
      this.toast = 'That piece is used up.';
      return false;
    }
    const next = cloneBoard(this.history.current());
    const built = this.makePiece(allowance, point.x, point.y, this.toolRot);
    if (allowance.kind === 'portal') {
      if (this.pendingLink) {
        built.props = { ...built.props, link: this.pendingLink };
        this.pendingLink = null;
      } else {
        const link = uid('link');
        built.props = { ...built.props, link };
        this.pendingLink = link;
      }
    }
    if (allowance.kind === 'door') {
      const switches = [...this.level.environment, ...next.pieces].filter((piece) => piece.kind === 'switch');
      const last = switches[switches.length - 1];
      if (last) built.props = { ...built.props, gate: last.uid };
    }
    next.pieces.push(built);
    this.history.commit(next);
    this.selected = [built.uid];
    this.toast = '';
    this.queue('place');
    this.popIn(built);
    this.markPreview();
    return true;
  }

  pointerDown(x: number, y: number, shift: boolean): void {
    if (this.mode !== 'build') {
      if (!this.outcome) return;
      this.edit();
    }
    this.pointer = { x, y };
    const hit = this.hitPiece(x, y);
    if (hit) {
      if (shift) {
        this.selected = this.selected.includes(hit)
          ? this.selected.filter((id) => id !== hit)
          : [...this.selected, hit];
      } else if (!this.selected.includes(hit)) {
        this.selected = [hit];
      }
      const origin = new Map<string, { x: number; y: number }>();
      for (const id of this.selected) {
        const piece = this.pieces.find((entry) => entry.uid === id);
        if (piece) origin.set(id, { x: piece.x, y: piece.y });
      }
      this.drag = {
        ids: [...this.selected],
        sx: x,
        sy: y,
        origin,
        moved: false,
        before: cloneBoard(this.history.current()),
      };
      this.hover = null;
      return;
    }
    if (this.sandbox) {
      const anchor = this.hitAnchor(x, y);
      if (anchor) {
        this.selected = [`${anchor.kind}:${anchor.id}`];
        this.anchor = {
          ...anchor,
          sx: x,
          sy: y,
          moved: false,
          before: cloneBoard(this.history.current()),
        };
        this.hover = null;
        return;
      }
    }
    if (!shift && this.tool !== null) {
      this.placeAt(x, y);
      return;
    }
    this.selected = [];
  }

  pointerMove(x: number, y: number): void {
    this.pointer = { x, y };
    if (this.drag) {
      const dx = x - this.drag.sx;
      const dy = y - this.drag.sy;
      if (!this.drag.moved && Math.hypot(dx, dy) < 0.05) return;
      this.drag.moved = true;
      this.guides = [];
      for (const id of this.drag.ids) {
        const piece = this.pieces.find((entry) => entry.uid === id);
        const origin = this.drag.origin.get(id);
        if (!piece || !origin) continue;
        const aligned = this.align(origin.x + dx, origin.y + dy, id);
        piece.x = snap(aligned.x, this.snap);
        piece.y = snap(aligned.y, this.snap);
      }
      this.markPreview();
      return;
    }
    if (this.anchor) {
      const dx = x - this.anchor.sx;
      const dy = y - this.anchor.sy;
      if (!this.anchor.moved && Math.hypot(dx, dy) < 0.05) return;
      this.anchor.moved = true;
      const board = this.history.current();
      if (this.anchor.kind === 'goal') {
        const goal = board.goals.find((entry) => entry.id === this.anchor?.id);
        if (goal) {
          goal.x = snap(this.anchor.ox + dx, this.snap);
          goal.y = snap(this.anchor.oy + dy, this.snap);
        }
      } else {
        const start = board.starts.find((entry) => entry.id === this.anchor?.id);
        if (start) {
          start.x = snap(this.anchor.ox + dx, this.snap);
          start.y = snap(this.anchor.oy + dy, this.snap);
        }
      }
      this.markPreview();
      return;
    }
    this.updateHover(x, y);
  }

  pointerUp(): void {
    if (this.drag) {
      if (this.drag.moved) {
        const after = cloneBoard(this.history.current());
        this.history.resetPresent(this.drag.before);
        this.history.commit(after);
      }
      this.drag = null;
      this.guides = [];
      this.syncPending();
    }
    if (this.anchor) {
      if (this.anchor.moved) {
        const after = cloneBoard(this.history.current());
        this.history.resetPresent(this.anchor.before);
        this.history.commit(after);
      }
      this.anchor = null;
    }
  }

  cancelDrag(): void {
    if (this.drag?.moved) this.history.resetPresent(this.drag.before);
    if (this.anchor?.moved) this.history.resetPresent(this.anchor.before);
    this.drag = null;
    this.anchor = null;
    this.guides = [];
    this.markPreview();
  }

  rotate(dir: number, fine = false): void {
    if (this.mode !== 'build') return;
    const step = (((fine || this.snap === 0) ? 5 : 15) * Math.PI) / 180;
    const pieceIds = this.selected.filter((id) => !id.startsWith('goal:') && !id.startsWith('start:'));
    if (pieceIds.length === 0) {
      this.toolRot += dir * step;
      this.refreshHover();
      return;
    }
    const next = cloneBoard(this.history.current());
    for (const piece of next.pieces) {
      if (pieceIds.includes(piece.uid)) piece.rot += dir * step;
    }
    this.history.commit(next);
    this.markPreview();
  }

  nudge(x: number, y: number, fine = false): void {
    if (this.mode !== 'build' || this.selected.length === 0) return;
    const step = fine ? 0.05 : this.snap > 0 ? this.snap : 0.1;
    this.translate(x * step, y * step);
  }

  duplicate(): void {
    if (this.mode !== 'build') return;
    const ids = this.selected.filter((id) => !id.startsWith('goal:') && !id.startsWith('start:'));
    if (ids.length === 0) return;
    const next = cloneBoard(this.history.current());
    const created: string[] = [];
    for (const id of ids) {
      const source = next.pieces.find((piece) => piece.uid === id);
      if (!source) continue;
      const index = allowanceIndex(source, this.level.palette);
      if (index < 0 || remaining(next.pieces, this.level.palette, index) <= 0) {
        this.toast = 'Nothing left to copy.';
        continue;
      }
      const copy: Piece = structuredClone(source);
      copy.uid = uid(source.kind.slice(0, 2));
      copy.x = snap(source.x + 0.45, this.snap || 0.05);
      copy.y = snap(source.y + 0.45, this.snap || 0.05);
      if (copy.kind === 'portal') {
        const link = this.pendingLink ?? uid('link');
        copy.props = { ...copy.props, link };
        this.pendingLink = this.pendingLink ? null : link;
      }
      next.pieces.push(copy);
      created.push(copy.uid);
    }
    if (created.length === 0) return;
    this.history.commit(next);
    for (const piece of next.pieces) if (created.includes(piece.uid)) this.popIn(piece);
    this.selected = created;
    this.syncPending();
    this.toast = '';
    this.markPreview();
  }

  removeSelected(): void {
    if (this.mode !== 'build' || this.selected.length === 0) return;
    const pieceIds = this.selected.filter((id) => !id.startsWith('goal:') && !id.startsWith('start:'));
    if (pieceIds.length === 0) {
      this.toast = 'Drag the ring or the ball. They stay in the level.';
      return;
    }
    const next = cloneBoard(this.history.current());
    for (const piece of next.pieces) {
      if (pieceIds.includes(piece.uid)) this.puffAt(piece.x, piece.y, Math.max(piece.w, piece.h), 'rgba(120, 88, 56, 0.35)');
    }
    next.pieces = next.pieces.filter((piece) => !pieceIds.includes(piece.uid));
    this.history.commit(next);
    this.selected = [];
    this.syncPending();
    this.queue('remove');
    this.markPreview();
  }

  replaceSelected(): void {
    if (this.mode !== 'build' || this.tool === null || this.selected.length !== 1) return;
    const allowance = this.level.palette[this.tool];
    if (!allowance) return;
    const id = this.selected[0];
    if (!id || id.startsWith('goal:') || id.startsWith('start:')) return;
    const next = cloneBoard(this.history.current());
    const index = next.pieces.findIndex((piece) => piece.uid === id);
    if (index < 0) return;
    const current = next.pieces[index];
    if (!current || sameAllowance(current, allowance)) return;
    next.pieces.splice(index, 1);
    if (allowance.kind !== 'portal' && remaining(next.pieces, this.level.palette, this.tool) <= 0) {
      this.toast = 'That piece is used up.';
      return;
    }
    const built = this.makePiece(allowance, current.x, current.y, current.rot);
    if (allowance.kind === 'portal') {
      const link = this.pendingLink ?? uid('link');
      built.props = { ...built.props, link };
      this.pendingLink = this.pendingLink ? null : link;
    }
    next.pieces.push(built);
    this.history.commit(next);
    this.popIn(built);
    this.selected = [built.uid];
    this.syncPending();
    this.toast = '';
    this.markPreview();
  }

  linkDoor(): void {
    if (this.selected.length !== 1) return;
    const switches = [...this.level.environment, ...this.pieces].filter((piece) => piece.kind === 'switch');
    if (switches.length === 0) {
      this.toast = 'Place a switch first.';
      return;
    }
    const next = cloneBoard(this.history.current());
    const door = next.pieces.find((piece) => piece.uid === this.selected[0]);
    if (!door || door.kind !== 'door') return;
    const current = switches.findIndex((piece) => piece.uid === door.props.gate);
    const pick = switches[(current + 1) % switches.length];
    if (!pick) return;
    door.props = { ...door.props, gate: pick.uid };
    this.history.commit(next);
    this.toast = 'Door linked to the next switch.';
  }

  clearBoard(): void {
    if (this.mode !== 'build' || this.pieces.length === 0) return;
    const next = cloneBoard(this.history.current());
    next.pieces = [];
    this.history.commit(next);
    this.selected = [];
    this.pendingLink = null;
    this.toast = '';
    this.markPreview();
  }

  undo(): void {
    if (this.mode !== 'build' || !this.history.undo()) return;
    this.afterHistory();
  }

  redo(): void {
    if (this.mode !== 'build' || !this.history.redo()) return;
    this.afterHistory();
  }

  launch(): void {
    this.sim = createState(toSim(this.playLevel(), this.pieces));
    this.mode = 'run';
    this.paused = false;
    this.outcome = null;
    this.reported = false;
    this.winHold = 0;
    this.acc = 0;
    this.eventSeen = 0;
    this.trails = new Map();
    this.trail = [];
    this.attempts += 1;
    this.selected = [];
    this.hover = null;
    this.toast = '';
    this.fx.balls = new Map();
    this.fx.pulses = new Map();
    this.fx.flash = null;
    this.hitStop = 0;
    this.punch = 0;
    this.winAt = this.reducedMotion ? -1 : this.predictWin();
    const goal = this.goals[this.goals.length - 1];
    if (goal) this.punchFocus = { x: goal.x, y: goal.y };
    for (const start of this.starts) {
      this.ring(start.x, start.y, 0.55, '#EA580C', 0.45);
      this.sparks(start.x, start.y, 0, 1, 6, 2.6, '#FDBA74', Math.PI);
    }
    this.queue('launch');
  }

  togglePause(): void {
    if (this.mode !== 'run' || this.outcome) return;
    this.paused = !this.paused;
  }

  edit(): void {
    this.mode = 'build';
    this.paused = false;
    this.sim = null;
    this.outcome = null;
    this.reported = false;
    this.winAt = -1;
    this.fx.flash = null;
    this.markPreview();
  }

  setSpeed(value: number): void {
    this.speed = value;
  }

  stepFrame(): void {
    if (this.mode !== 'run' || !this.sim || this.outcome) return;
    this.paused = true;
    const simLevel = toSim(this.playLevel(), this.pieces);
    for (let i = 0; i < 6; i += 1) {
      if (this.sim.phase !== 'running') break;
      step(simLevel, this.sim);
      this.spinBalls();
      this.sampleTrail();
    }
    this.consumeEvents();
    if (this.sim.phase === 'lost') this.finish('lost');
    if (this.sim.phase === 'won') this.finish('won');
  }

  hint(): void {
    if (this.hintIndex >= this.level.hints.length) return;
    this.hintIndex += 1;
    this.queue('ui');
  }

  hintText(): string {
    if (this.hintIndex <= 0) return '';
    return this.level.hints[this.hintIndex - 1] ?? '';
  }

  guide(cleared: boolean): string {
    if (this.pendingLink && this.mode === 'build') return 'Place the other end of the portal.';
    if (this.sandbox || this.level.id !== 'w1-gap' || cleared) return '';
    if (this.mode === 'run' && !this.outcome) return 'Watch. Space runs it again the moment you want a change.';
    if (this.outcome === 'lost' || (this.attempts > 0 && this.pieces.length > 0)) {
      return 'Change the ramp, then launch again. Nothing is spent.';
    }
    if (this.pieces.length === 0 && this.tool === null) return 'Choose the ramp.';
    if (this.pieces.length === 0) return 'Tap the board where the ramp should sit.';
    return 'Launch, then watch the ball.';
  }

  tick(dt: number): void {
    this.updateParticles(dt);
    this.updateFx(dt);
    this.shake = Math.max(0, this.shake - dt * 1.8);
    if (this.camTween) {
      const tween = this.camTween;
      tween.t = Math.min(1, tween.t + dt / 0.42);
      const k = 1 - Math.pow(1 - tween.t, 3);
      this.camera = {
        x: tween.from.x + (tween.to.x - tween.from.x) * k,
        y: tween.from.y + (tween.to.y - tween.from.y) * k,
        zoom: tween.from.zoom + (tween.to.zoom - tween.from.zoom) * k,
      };
      if (tween.t >= 1) this.camTween = null;
    }
    if (this.follow && this.sim && this.mode === 'run') {
      const ball = this.sim.balls.find((entry) => entry.alive) ?? this.sim.balls[0];
      if (ball) {
        const blend = this.reducedMotion ? 1 : 1 - Math.pow(0.02, Math.max(dt, 0.001));
        this.camera.x += (ball.x - this.camera.x) * blend;
        this.camera.y += (ball.y - this.camera.y) * blend;
      }
    }
    if (this.mode === 'build') {
      this.decayPreview(dt);
      return;
    }
    if (this.paused || !this.sim || this.outcome) return;
    if (this.hitStop > 0) {
      this.hitStop -= dt;
      return;
    }
    const slow = this.slowMotion();
    this.punch += ((slow < 1 ? 1 : 0) - this.punch) * (1 - Math.pow(0.004, dt));
    this.acc += dt * this.speed * slow;
    if (this.acc > 0.05) this.acc = 0.05;
    const simLevel = toSim(this.playLevel(), this.pieces);
    while (this.acc >= FIXED_DT) {
      step(simLevel, this.sim);
      this.acc -= FIXED_DT;
      this.spinBalls();
      this.sampleTrail();
      this.consumeEvents();
      if (this.sim.phase !== 'running') break;
    }
    if (this.sim.phase === 'won') {
      this.winHold += dt;
      const hold = this.winAt > 0 ? 1.15 : 0.4;
      if (this.winHold > hold && !this.reported) this.finish('won');
    } else if (this.sim.phase === 'lost' && !this.reported) {
      this.finish('lost');
    }
  }

  /** Playback rate for the finish: the run eases into slow motion just before the ring, Peggle style. */
  private slowMotion(): number {
    if (!this.sim || this.winAt < 0) return 1;
    if (this.sim.phase === 'won') return SLOW_SCALE;
    const lead = this.winAt - this.sim.t;
    if (lead > SLOW_LEAD) return 1;
    const k = Math.max(0, lead) / SLOW_LEAD;
    return SLOW_SCALE + (1 - SLOW_SCALE) * k * k;
  }

  /** Runs this build once, off screen, to learn whether and when it wins. The sim is deterministic. */
  private predictWin(): number {
    const level = toSim(this.playLevel(), this.pieces);
    const state = createState(level);
    const steps = Math.ceil((level.maxTime + 0.5) / FIXED_DT);
    for (let i = 0; i < steps; i += 1) {
      step(level, state);
      if (state.phase === 'won') return state.t;
      if (state.phase === 'lost') return -1;
    }
    return -1;
  }

  drainSounds(): string[] {
    const queued = this.sounds;
    this.sounds = [];
    return queued;
  }

  resize(width: number, height: number, inset = this.inset): void {
    this.viewW = Math.max(1, width);
    this.viewH = Math.max(1, height);
    this.inset = inset;
    if (!this.movedCamera) this.camera = fitCamera(this.level.view, this.viewW, this.viewH, this.inset);
  }

  pan(dx: number, dy: number): void {
    this.movedCamera = true;
    this.camTween = null;
    this.camera.x -= dx / this.camera.zoom;
    this.camera.y += dy / this.camera.zoom;
  }

  zoomAt(sx: number, sy: number, factor: number): void {
    this.movedCamera = true;
    this.camTween = null;
    const before = screenToWorld(this.camera, this.viewW, this.viewH, sx, sy);
    this.camera.zoom = Math.max(18, Math.min(160, this.camera.zoom * factor));
    const after = screenToWorld(this.camera, this.viewW, this.viewH, sx, sy);
    this.camera.x += before.x - after.x;
    this.camera.y += before.y - after.y;
  }

  frame(): void {
    this.movedCamera = false;
    const to = fitCamera(this.level.view, this.viewW, this.viewH, this.inset);
    if (this.reducedMotion) this.camera = to;
    else this.camTween = { from: { ...this.camera }, to, t: 0 };
  }

  clearHover(): void {
    if (!this.hover) return;
    this.hover = null;
    this.hoverKey = '';
    this.markPreview();
  }

  setName(name: string): void {
    this.level = { ...this.level, name };
  }

  loadBoard(pieces: Piece[], starts: BallStart[], goals: Goal[]): void {
    this.history = new History({
      pieces: structuredClone(pieces),
      starts: structuredClone(starts),
      goals: structuredClone(goals),
    });
    this.mode = 'build';
    this.sim = null;
    this.outcome = null;
    this.selected = [];
    this.ghost = [];
    this.syncPending();
    this.markPreview();
  }

  private translate(dx: number, dy: number): void {
    const next = cloneBoard(this.history.current());
    let changed = false;
    for (const id of this.selected) {
      if (id.startsWith('goal:')) {
        const goal = next.goals.find((entry) => entry.id === id.slice(5));
        if (goal) {
          goal.x += dx;
          goal.y += dy;
          changed = true;
        }
        continue;
      }
      if (id.startsWith('start:')) {
        const start = next.starts.find((entry) => entry.id === id.slice(6));
        if (start) {
          start.x += dx;
          start.y += dy;
          changed = true;
        }
        continue;
      }
      const piece = next.pieces.find((entry) => entry.uid === id);
      if (piece) {
        piece.x += dx;
        piece.y += dy;
        changed = true;
      }
    }
    if (!changed) return;
    this.history.commit(next);
    this.markPreview();
  }

  private afterHistory(): void {
    this.selected = [];
    this.drag = null;
    this.anchor = null;
    this.guides = [];
    this.syncPending();
    this.markPreview();
  }

  private playLevel(): Level {
    return { ...this.level, starts: this.starts, goals: this.goals };
  }

  private finish(phase: 'won' | 'lost'): void {
    if (!this.sim) return;
    this.reported = true;
    this.outcome = phase;
    this.paused = true;
    this.ghost = [...this.trails.values()].map((points) => points.filter((_, index) => index % 2 === 0));
    if (phase === 'won') {
      this.medals = scoreAttempt(true, this.pieces.length, this.sim.t, this.level.medals);
      this.toast = '';
      this.queue('win');
      if (!this.reducedMotion) {
        this.shake = 0.5;
        this.fx.flash = { color: '255, 244, 214', life: 0.5, max: 0.5 };
        for (const goal of this.goals) this.confetti(goal.x, goal.y, 46);
      }
      return;
    }
    this.toast = this.sim.reason || 'The ball never arrived.';
    this.queue('fail');
    if (!this.reducedMotion) {
      this.shake = Math.max(this.shake, 0.45);
      this.fx.flash = { color: '159, 18, 57', life: 0.55, max: 0.55 };
      for (const ball of this.sim.balls) {
        const y = ball.alive ? ball.y : Math.max(ball.y, this.level.killY);
        this.puffAt(ball.x, y, 0.9, 'rgba(159, 18, 57, 0.45)');
        this.ring(ball.x, y, 0.8, '#9F1239', 0.5);
      }
    }
  }

  private sampleTrail(): void {
    if (!this.sim) return;
    for (const ball of this.sim.balls) {
      const list = this.trails.get(ball.id) ?? [];
      const last = list[list.length - 1];
      if (!last || Math.hypot(ball.x - last.x, ball.y - last.y) > 0.04) {
        list.push({ x: ball.x, y: ball.y });
        if (list.length > 700) list.shift();
        this.trails.set(ball.id, list);
      }
    }
    this.trail = [...this.trails.values()];
  }

  private consumeEvents(): void {
    if (!this.sim) return;
    const events = this.sim.events;
    const fresh = Math.min(events.length, this.sim.eventCount - this.eventSeen);
    this.eventSeen = this.sim.eventCount;
    for (let i = events.length - fresh; i < events.length; i += 1) {
      const event = events[i];
      if (!event) continue;
      this.queue(event.kind);
      this.react(event);
    }
  }

  /** Turns one simulation event into squash, piece reactions, particles, and weight. */
  private react(event: SimEvent): void {
    if (event.uid) this.fx.pulses.set(event.uid, 0);
    if (event.kind === 'portal' && event.note) this.fx.pulses.set(event.note, 0);
    const impact = event.impact ?? 0;
    if (event.ball && event.nx !== undefined && event.ny !== undefined && impact > 0) {
      const fx = this.ballFx(event.ball);
      fx.amp = Math.min(0.34, 0.05 + impact * 0.028);
      fx.age = 0;
      fx.nx = event.nx;
      fx.ny = event.ny;
    }
    if (this.reducedMotion) return;
    const nx = event.nx ?? 0;
    const ny = event.ny ?? 1;
    if (event.kind === 'bounce') {
      if (event.note === 'bouncer') {
        this.ring(event.x, event.y, 0.9, '#EA580C', 0.38);
        this.sparks(event.x, event.y, nx, ny, 9, 5, '#FB923C', 1.3);
        this.shake = Math.max(this.shake, 0.22);
      } else {
        const strength = Math.min(1, impact / 9);
        this.dust(event.x - nx * 0.12, event.y - ny * 0.12, nx, ny, 3 + Math.round(strength * 4), strength);
        if (impact > 6) this.shake = Math.max(this.shake, strength * 0.25);
      }
      return;
    }
    if (event.kind === 'spring' || event.kind === 'cannon') {
      const cannon = event.kind === 'cannon';
      this.sparks(event.x, event.y, nx, ny, cannon ? 12 : 8, cannon ? 7 : 5, cannon ? '#FDBA74' : '#F59E0B', 0.7);
      this.ring(event.x - nx * 0.2, event.y - ny * 0.2, cannon ? 1 : 0.7, cannon ? '#243140' : '#C45C12', 0.35);
      if (cannon) {
        for (let i = 0; i < 6; i += 1) {
          this.push('puff', event.x - nx * 0.3, event.y - ny * 0.3, nx * (1 + i * 0.3) + (Math.random() - 0.5), ny * (1 + i * 0.3) + (Math.random() - 0.5), 0.7, 'rgba(90, 96, 110, 0.45)', 0.18 + i * 0.03, 0, 0, -1.5, 2.2);
        }
      }
      this.hitStop = cannon ? 0.07 : 0.04;
      this.shake = Math.max(this.shake, cannon ? 0.5 : 0.25);
      return;
    }
    if (event.kind === 'portal') {
      this.ring(event.x, event.y, 0.8, '#7C3AED', 0.45);
      this.sparks(event.x, event.y, 0, 1, 10, 3, '#A78BFA', Math.PI);
      return;
    }
    if (event.kind === 'switch') {
      this.ring(event.x, event.y, 0.9, '#0F766E', 0.45);
      this.sparks(event.x, event.y, 0, 1, 8, 3.5, '#5EEAD4', Math.PI);
      this.hitStop = 0.05;
      return;
    }
    if (event.kind === 'break') {
      const piece = [...this.level.environment, ...this.pieces].find((entry) => entry.uid === event.uid);
      const cx = piece?.x ?? event.x;
      const cy = piece?.y ?? event.y;
      const span = piece ? piece.w : 1.4;
      const angle = piece?.rot ?? 0;
      for (let i = 0; i < 16; i += 1) {
        const along = (i / 15 - 0.5) * span;
        const x = cx + Math.cos(angle) * along;
        const y = cy + Math.sin(angle) * along;
        this.push('shard', x, y, (Math.random() - 0.5) * 3 - nx * 1.5, Math.random() * 2.5 - ny * 1.5, 0.9 + Math.random() * 0.4, i % 3 === 0 ? '#1F6F78' : '#9ED6DC', 0.07 + Math.random() * 0.08, Math.random() * 6, (Math.random() - 0.5) * 16, 10, 0.4);
      }
      this.ring(event.x, event.y, 1.1, '#1F6F78', 0.4);
      this.hitStop = 0.06;
      this.shake = Math.max(this.shake, 0.5);
      return;
    }
    if (event.kind === 'goal') {
      this.ring(event.x, event.y, 1.6, '#0F766E', 0.6);
      this.ring(event.x, event.y, 1.0, '#F59E0B', 0.45);
      this.sparks(event.x, event.y, 0, 1, 16, 5, '#FCD34D', Math.PI);
    }
  }

  private ballFx(id: string): BallFx {
    let fx = this.fx.balls.get(id);
    if (!fx) {
      fx = { spin: 0, amp: 0, age: 1, nx: 0, ny: 1 };
      this.fx.balls.set(id, fx);
    }
    return fx;
  }

  private spinBalls(): void {
    if (!this.sim) return;
    for (const ball of this.sim.balls) {
      if (!ball.alive) continue;
      this.ballFx(ball.id).spin -= (ball.vx * FIXED_DT) / ball.r;
    }
  }

  private updateFx(dt: number): void {
    const fx = this.fx;
    fx.iris = this.reducedMotion ? 1 : Math.min(1, fx.iris + dt / 0.75);
    const target = this.mode === 'run' ? 1 : 0;
    fx.modeBlend += (target - fx.modeBlend) * (this.reducedMotion ? 1 : 1 - Math.pow(0.001, dt));
    for (const ball of fx.balls.values()) ball.age += dt;
    for (const [id, age] of fx.pulses) {
      if (age > 1.5) fx.pulses.delete(id);
      else fx.pulses.set(id, age + dt);
    }
    for (const [id, age] of fx.spawns) {
      if (age > 0.8) fx.spawns.delete(id);
      else fx.spawns.set(id, age + dt);
    }
    if (fx.flash) {
      fx.flash.life -= dt;
      if (fx.flash.life <= 0) fx.flash = null;
    }
    if (this.mode === 'build') this.punch = Math.max(0, this.punch - dt * 2.4);
  }

  private decayPreview(dt: number): void {
    if (!this.previewDirty || this.level.trajectory === 'off') return;
    this.previewWait -= dt;
    if (this.previewWait > 0) return;
    this.rebuildPreview();
  }

  private markPreview(): void {
    this.previewDirty = true;
    this.previewWait = 0.04;
  }

  private rebuildPreview(): void {
    this.previewDirty = false;
    if (this.level.trajectory === 'off' || this.level.previewSeconds <= 0) {
      this.preview = [];
      return;
    }
    const extra = this.hover && this.hoverOk ? [this.hover] : [];
    const seconds = this.level.trajectory === 'partial' ? this.level.previewSeconds * 0.5 : this.level.previewSeconds;
    const result = run(toSim(this.playLevel(), [...this.pieces, ...extra]), Math.max(0.25, seconds));
    const buckets = new Map<string, { x: number; y: number }[]>();
    for (const sample of result.samples) {
      for (const ball of sample.balls) {
        const list = buckets.get(ball.id) ?? [];
        list.push({ x: ball.x, y: ball.y });
        buckets.set(ball.id, list);
      }
    }
    this.preview = [...buckets.values()].map((points) =>
      this.level.trajectory === 'partial' ? points.slice(0, Math.max(4, Math.ceil(points.length * 0.6))) : points,
    );
  }

  private updateHover(x: number, y: number): void {
    if (this.mode !== 'build' || this.tool === null) {
      if (this.hover) this.clearHover();
      return;
    }
    const allowance = this.level.palette[this.tool];
    if (!allowance) return;
    const point = this.snapPoint(x, y);
    const completing = allowance.kind === 'portal' && this.pendingLink !== null;
    const ok = this.inside(point.x, point.y) && (completing || remaining(this.pieces, this.level.palette, this.tool) > 0);
    const key = `${point.x.toFixed(3)}:${point.y.toFixed(3)}:${this.toolRot.toFixed(3)}:${this.tool}:${ok}`;
    if (key === this.hoverKey) return;
    this.hoverKey = key;
    this.hoverOk = ok;
    const ghost = this.makePiece(allowance, point.x, point.y, this.toolRot, 'hover');
    if (allowance.kind === 'portal' && this.pendingLink) ghost.props = { ...ghost.props, link: this.pendingLink };
    this.hover = ghost;
    this.markPreview();
  }

  private refreshHover(): void {
    if (this.pointer) this.updateHover(this.pointer.x, this.pointer.y);
    else this.markPreview();
  }

  private hitPiece(x: number, y: number): string | null {
    for (let i = this.pieces.length - 1; i >= 0; i -= 1) {
      const piece = this.pieces[i];
      if (!piece) continue;
      if (pointInObb(x, y, piece.x, piece.y, piece.w / 2, piece.h / 2, piece.rot, 0.14)) return piece.uid;
    }
    return null;
  }

  private hitAnchor(x: number, y: number): { kind: 'goal' | 'start'; id: string; ox: number; oy: number } | null {
    for (const goal of this.goals) {
      if (Math.hypot(goal.x - x, goal.y - y) <= Math.max(0.5, goal.r)) {
        return { kind: 'goal', id: goal.id, ox: goal.x, oy: goal.y };
      }
    }
    for (const start of this.starts) {
      if (Math.hypot(start.x - x, start.y - y) <= 0.5) return { kind: 'start', id: start.id, ox: start.x, oy: start.y };
    }
    return null;
  }

  private align(x: number, y: number, ignore: string): { x: number; y: number } {
    if (this.snap <= 0) return { x, y };
    let nx = x;
    let ny = y;
    const guides: Guide[] = [];
    const others = [...this.level.environment, ...this.pieces.filter((piece) => piece.uid !== ignore)];
    for (const other of others) {
      if (Math.abs(other.x - nx) < 0.14) {
        nx = other.x;
        guides.push({ axis: 'x', at: other.x });
      }
      if (Math.abs(other.y - ny) < 0.14) {
        ny = other.y;
        guides.push({ axis: 'y', at: other.y });
      }
    }
    this.guides = guides;
    return { x: nx, y: ny };
  }

  private inside(x: number, y: number): boolean {
    const view = this.level.view;
    const pad = 0.4;
    return x >= view.x - pad && y >= view.y - pad && x <= view.x + view.w + pad && y <= view.y + view.h + pad;
  }

  private snapPoint(x: number, y: number): { x: number; y: number } {
    return { x: snap(x, this.snap), y: snap(y, this.snap) };
  }

  private makePiece(allowance: Allowance, x: number, y: number, rot: number, id?: string): Piece {
    const def = CATALOG[allowance.kind];
    return {
      uid: id ?? uid(allowance.kind.slice(0, 2)),
      kind: allowance.kind,
      x,
      y,
      rot,
      w: allowance.w ?? def.w,
      h: allowance.h ?? def.h,
      props: { ...(allowance.props ?? def.props) },
    };
  }

  private syncPending(): void {
    const counts = new Map<string, number>();
    for (const piece of this.pieces) {
      if (piece.kind !== 'portal' || !piece.props.link) continue;
      counts.set(piece.props.link, (counts.get(piece.props.link) ?? 0) + 1);
    }
    this.pendingLink = null;
    for (const [link, count] of counts) {
      if (count % 2 === 1) {
        this.pendingLink = link;
        break;
      }
    }
  }

  private queue(name: string): void {
    this.sounds.push(name);
  }

  private push(
    kind: ParticleKind,
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    color: string,
    size: number,
    rot = 0,
    spin = 0,
    gravity = 8,
    drag = 0,
  ): void {
    if (this.particles.length > 420) this.particles.shift();
    this.particles.push({ kind, x, y, vx, vy, life, max: life, color, size, rot, spin, gravity, drag });
  }

  private ring(x: number, y: number, radius: number, color: string, life: number): void {
    if (this.reducedMotion) return;
    this.push('ring', x, y, 0, 0, life, color, radius, 0, 0, 0);
  }

  /** A spray of streaks along a direction; spread is the half-angle in radians. */
  private sparks(x: number, y: number, nx: number, ny: number, count: number, speed: number, color: string, spread: number): void {
    if (this.reducedMotion) return;
    const base = Math.atan2(ny, nx);
    for (let i = 0; i < count; i += 1) {
      const angle = base + (Math.random() * 2 - 1) * spread;
      const v = speed * (0.5 + Math.random() * 0.7);
      this.push('spark', x, y, Math.cos(angle) * v, Math.sin(angle) * v, 0.28 + Math.random() * 0.22, color, 0.05, 0, 0, 6, 2.5);
    }
  }

  /** Soft dust kicked sideways along a surface. */
  private dust(x: number, y: number, nx: number, ny: number, count: number, strength: number): void {
    if (this.reducedMotion) return;
    for (let i = 0; i < count; i += 1) {
      const side = i % 2 === 0 ? 1 : -1;
      const v = (0.8 + Math.random() * 1.4) * (0.6 + strength);
      this.push('puff', x, y, -ny * side * v + nx * 0.4, nx * side * v + ny * 0.4, 0.4 + Math.random() * 0.25, 'rgba(120, 88, 56, 0.35)', 0.07 + Math.random() * 0.06, 0, 0, -0.6, 3.5);
    }
  }

  private puffAt(x: number, y: number, span: number, color: string): void {
    if (this.reducedMotion) return;
    for (let i = 0; i < 10; i += 1) {
      const angle = (i / 10) * Math.PI * 2;
      const v = 1 + Math.random() * 1.2;
      this.push('puff', x + Math.cos(angle) * span * 0.25, y + Math.sin(angle) * 0.1, Math.cos(angle) * v, Math.sin(angle) * v * 0.6, 0.45, color, 0.1 + Math.random() * 0.06, 0, 0, -0.5, 4);
    }
  }

  private confetti(x: number, y: number, count: number): void {
    if (this.reducedMotion) return;
    for (let i = 0; i < count; i += 1) {
      const angle = Math.PI / 2 + (Math.random() * 2 - 1) * 1.15;
      const v = 4 + Math.random() * 6;
      const color = CONFETTI[i % CONFETTI.length] ?? '#EA580C';
      this.push('confetti', x, y, Math.cos(angle) * v, Math.sin(angle) * v, 1.6 + Math.random() * 0.9, color, 0.07 + Math.random() * 0.05, Math.random() * 6, (Math.random() - 0.5) * 18, 7, 1.6);
    }
  }

  /** Spawn pop for a freshly placed piece, with dust at its ends. */
  private popIn(piece: Piece): void {
    this.fx.spawns.set(piece.uid, 0);
    if (this.reducedMotion) return;
    const cos = Math.cos(piece.rot);
    const sin = Math.sin(piece.rot);
    for (const end of [-0.5, 0.5]) {
      const x = piece.x + cos * piece.w * end;
      const y = piece.y + sin * piece.w * end;
      for (let i = 0; i < 3; i += 1) {
        this.push('puff', x, y, end * 2 * (0.6 + Math.random()), Math.random() * 0.8, 0.4, 'rgba(120, 88, 56, 0.3)', 0.08 + Math.random() * 0.05, 0, 0, -0.4, 3);
      }
    }
  }

  private updateParticles(dt: number): void {
    for (const particle of this.particles) {
      particle.life -= dt;
      const damp = particle.drag > 0 ? Math.exp(-particle.drag * dt) : 1;
      particle.vx *= damp;
      particle.vy *= damp;
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vy -= particle.gravity * dt;
      particle.rot += particle.spin * dt;
      if (particle.kind === 'confetti') particle.vx += Math.sin(particle.rot * 1.7) * dt * 3;
    }
    if (this.particles.length > 0) this.particles = this.particles.filter((particle) => particle.life > 0);
  }
}
