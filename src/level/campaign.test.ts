import { describe, expect, it } from 'vitest';
import { sameAllowance } from '../editor/budget';
import { SWIFT_GRACE } from '../progress/medals';
import { run, toSim } from '../physics/sim';
import { LEVELS, linearLevels } from './campaign';
import { SOLUTIONS } from './solutions';

function dump(id: string): string {
  const level = LEVELS.find((entry) => entry.id === id)!;
  const result = run(toSim(level, SOLUTIONS[id] ?? []), level.maxTime);
  const pts = result.samples
    .filter((_, index) => index % 12 === 0)
    .map((sample) => {
      const bits = sample.balls.map((ball) => `${ball.id}:${ball.x.toFixed(1)},${ball.y.toFixed(1)}`).join(' ');
      return `${sample.t.toFixed(1)}[${bits}]`;
    })
    .join(' ');
  return `${result.phase} ${result.reason} closest=${result.closest.toFixed(2)} t=${result.t.toFixed(2)} ${pts}`;
}

describe('campaign solutions', () => {
  it('has a solution for every level', () => {
    for (const level of LEVELS) expect(SOLUTIONS[level.id]?.length, level.id).toBeGreaterThan(0);
  });

  for (const level of LEVELS) {
    it(`${level.id} is solved by the authored build`, () => {
      const result = run(toSim(level, SOLUTIONS[level.id]!), level.maxTime);
      expect(result.phase, dump(level.id)).toBe('won');
      expect(result.t, level.id).toBeLessThanOrEqual(level.medals.seconds + SWIFT_GRACE);
      expect(SOLUTIONS[level.id]!.length, `${level.id} lean medal`).toBeLessThanOrEqual(level.medals.pieces);
    });

    it(`${level.id} does not solve itself`, () => {
      const result = run(toSim(level, []), level.maxTime);
      expect(result.phase, level.id).not.toBe('won');
    });
  }

  it('builds every solution from that level’s palette', () => {
    for (const level of LEVELS) {
      const used = new Array(level.palette.length).fill(0);
      for (const built of SOLUTIONS[level.id] ?? []) {
        const index = level.palette.findIndex((allowance) => sameAllowance(built, allowance));
        expect(index, `${level.id} ${built.kind}`).toBeGreaterThanOrEqual(0);
        used[index] += 1;
      }
      level.palette.forEach((allowance, index) => {
        const limit = allowance.kind === 'portal' ? allowance.count * 2 : allowance.count;
        expect(used[index], `${level.id} ${allowance.label ?? allowance.kind}`).toBeLessThanOrEqual(limit);
      });
    }
  });

  it('keeps a linear path with no secret gates in the middle', () => {
    const ids = linearLevels().map((level) => level.id);
    expect(ids[0]).toBe('w1-gap');
    expect(ids).not.toContain('w1-quiet');
    expect(new Set(ids).size).toBe(ids.length);
  });
});
