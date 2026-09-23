import { describe, expect, it } from 'vitest';
import { circleObb } from './collide';
import { BALL_R, run, type SimLevel } from './sim';
import type { Piece } from '../core/types';

function plank(uid: string, kind: Piece['kind'], x: number, y: number, w: number, h: number, rot = 0, props: Piece['props'] = {}): Piece {
  return { uid, kind, x, y, w, h, rot, props };
}

function world(pieces: Piece[], ball: { x: number; y: number; vx?: number; vy?: number }, extra: Partial<SimLevel> = {}): SimLevel {
  return {
    gravity: 18,
    maxTime: 8,
    killY: -6,
    goals: [],
    pieces,
    starts: [{ id: 'a', x: ball.x, y: ball.y, r: BALL_R }],
    ...extra,
  };
}

describe('circleObb', () => {
  it('misses a distant circle', () => {
    expect(circleObb(5, 5, 0.3, 0, 0, 1, 0.2, 0)).toBeNull();
  });

  it('hits from above with an upward normal', () => {
    const hit = circleObb(0, 0.5, 0.3, 0, 0, 1, 0.2, 0);
    expect(hit).not.toBeNull();
    expect(hit!.ny).toBeGreaterThan(0.9);
  });

  it('pushes out of an overlapping center', () => {
    const hit = circleObb(0, 0, 0.3, 0, 0, 1, 0.5, 0);
    expect(hit).not.toBeNull();
    expect(hit!.pen).toBeGreaterThan(0.3);
  });
});

describe('simulation', () => {
  it('rests a ball on a platform', () => {
    const result = run(world([plank('floor', 'platform', 0, 0, 4, 0.28)], { x: 0, y: 2 }), 2);
    const b = result.balls[0]!;
    expect(b.alive).toBe(true);
    expect(b.y).toBeGreaterThan(0.4);
    expect(b.y).toBeLessThan(0.6);
    expect(Math.hypot(b.vx, b.vy)).toBeLessThan(0.3);
    expect(result.phase).toBe('lost');
    expect(result.reason).toMatch(/momentum|moving/);
  });

  it('slides down a ramp and gains horizontal speed', () => {
    const rot = -20 * (Math.PI / 180);
    const result = run(world([plank('ramp', 'ramp', 0, 3, 8, 0.22, rot)], { x: -2.2, y: 5.2 }), 1.6);
    const b = result.balls[0]!;
    expect(b.x).toBeGreaterThan(0.4);
    expect(b.y).toBeLessThan(4.6);
  });

  it('launches from a spring to a predictable height', () => {
    const spring = plank('s', 'spring', 0, 1, 1.1, 0.5, Math.PI / 2, { power: 12 });
    const result = run(world([spring], { x: 0, y: 1 }), 0.7);
    const peak = Math.max(...result.samples.map((s) => s.balls[0]!.y));
    expect(peak).toBeGreaterThan(4);
    expect(peak).toBeLessThan(6.2);
  });

  it('lets a ball pass up through a one-way shelf and land on it', () => {
    const spring = plank('s', 'spring', 0, 0.4, 1, 0.4, Math.PI / 2, { power: 14 });
    const shelf = plank('shelf', 'oneway', 0, 3.2, 1.6, 0.18);
    const result = run(world([spring, shelf], { x: 0, y: 0.5 }), 3.5);
    const b = result.balls[0]!;
    expect(b.y).toBeGreaterThan(3.2);
    expect(b.y).toBeLessThan(4.1);
  });

  it('teleports through a linked portal and turns velocity', () => {
    const entry = plank('in', 'portal', 0, 2, 0.4, 1.4, -Math.PI / 2, { link: 'ab' });
    const exit = plank('out', 'portal', 6, 4, 0.4, 1.4, 0, { link: 'ab' });
    const result = run(world([entry, exit], { x: 0, y: 4.5 }), 2);
    const seen = result.samples.some((s) => s.balls[0]!.x > 5);
    expect(seen).toBe(true);
    expect(result.events.some((e) => e.kind === 'portal')).toBe(true);
  });

  it('is deterministic', () => {
    const pieces = [plank('floor', 'platform', 0, 0, 6, 0.28), plank('ramp', 'ramp', -1, 2, 3, 0.22, -0.4)];
    const a = run(world(pieces, { x: -1, y: 4 }), 2);
    const b = run(world(pieces, { x: -1, y: 4 }), 2);
    expect(a.balls[0]).toEqual(b.balls[0]);
    expect(a.t).toBe(b.t);
  });

  it('does not treat an empty goal list as a win', () => {
    const result = run(world([plank('floor', 'platform', 0, 0, 4, 0.28)], { x: 0, y: 1 }), 0.2);
    expect(result.phase).toBe('running');
  });

  it('pulls sideways inside a gravity field', () => {
    const zone = plank('g', 'gravity', 0, 2, 4, 4, 0, { power: 22 });
    const result = run(world([zone], { x: -0.5, y: 2 }), 0.55);
    expect(result.balls[0]!.x).toBeGreaterThan(1.2);
  });

  it('breaks a floor when the impact is hard', () => {
    const block = plank('b', 'breakable', 0, 2, 2.4, 0.28, 0, { threshold: 5 });
    const result = run(
      world([block], { x: 0, y: 5 }, { goals: [{ id: 'g', x: 0, y: 0.6, r: 1 }] }),
      3,
    );
    expect(result.broken).toContain('b');
    expect(result.phase).toBe('won');
  });

  it('opens a door after the switch', () => {
    const belt = plank('belt', 'conveyor', 0, 0, 9, 0.28, 0, { power: 4 });
    const sw = plank('sw', 'switch', -1, 0.55, 1, 0.9);
    const door = plank('door', 'door', 1.6, 0.9, 0.28, 1.5, 0, { gate: 'sw' });
    const level = world([belt, sw, door], { x: -3.2, y: 0.55 }, {
      goals: [{ id: 'g', x: 3.4, y: 0.8, r: 0.8 }],
    });
    const result = run(level, 5);
    expect(result.latched).toContain('sw');
    expect(result.phase).toBe('won');
  });
});
