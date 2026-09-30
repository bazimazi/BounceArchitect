import { LEVELS, levelsInWorld, linearLevels, WORLDS } from '../level/campaign';
import { dailiesDone, longestStreak } from '../level/daily';
import { medalCount } from './medals';
import type { LevelRecord, SaveData } from './save';

/**
 * Feats reward how you play, not only how far you get: clearing on the first launch,
 * coming back to a passed puzzle, keeping a daily streak. Each counts toward a target,
 * so the logbook can show how close the next one is.
 */
export interface Feat {
  id: string;
  name: string;
  blurb: string;
  need: number;
  /** Shown as unmarked until earned, so it stays a surprise. */
  hidden?: boolean;
  count(save: SaveData): number;
}

function tally(save: SaveData, test: (record: LevelRecord) => boolean, secret = false): number {
  return LEVELS.filter((level) => Boolean(level.secret) === secret).filter((level) => {
    const record = save.levels[level.id];
    return record ? test(record) : false;
  }).length;
}

/** Worlds where every campaign level holds all three medals. */
export function perfectWorlds(save: SaveData): number {
  return WORLDS.filter((world) => {
    const levels = levelsInWorld(world.id).filter((level) => !level.secret);
    return levels.length > 0 && levels.every((level) => medalCount(save.levels[level.id]) === 3);
  }).length;
}

export const FEATS: Feat[] = [
  {
    id: 'first-ring',
    name: 'First ring',
    blurb: 'Land the ball in a ring.',
    need: 1,
    count: (save) => tally(save, (record) => record.reach),
  },
  {
    id: 'called-it',
    name: 'Called it',
    blurb: 'Clear a puzzle on its very first launch.',
    need: 1,
    count: (save) => tally(save, (record) => Boolean(record.reach && record.firstTry)),
  },
  {
    id: 'no-notes',
    name: 'No notes',
    blurb: 'Clear 5 puzzles without opening a hint.',
    need: 5,
    count: (save) => tally(save, (record) => Boolean(record.reach && record.unaided)),
  },
  {
    id: 'second-look',
    name: 'Second look',
    blurb: 'Come back and clear a puzzle you passed on.',
    need: 1,
    count: (save) => tally(save, (record) => Boolean(record.reach && record.passed)),
  },
  {
    id: 'spare-parts',
    name: 'Spare parts',
    blurb: 'Earn Lean on 10 puzzles.',
    need: 10,
    count: (save) => tally(save, (record) => record.lean),
  },
  {
    id: 'stopwatch',
    name: 'Stopwatch',
    blurb: 'Earn Swift on 10 puzzles.',
    need: 10,
    count: (save) => tally(save, (record) => record.swift),
  },
  {
    id: 'clean-lines',
    name: 'Clean lines',
    blurb: 'Earn all three medals on 5 puzzles.',
    need: 5,
    count: (save) => tally(save, (record) => medalCount(record) === 3),
  },
  {
    id: 'signature',
    name: 'Signature work',
    blurb: 'Earn every medal in one world.',
    need: 1,
    count: perfectWorlds,
  },
  {
    id: 'grand-tour',
    name: 'Grand tour',
    blurb: 'Reach the ring in every campaign puzzle.',
    need: linearLevels().length,
    count: (save) => tally(save, (record) => record.reach),
  },
  {
    id: 'off-the-plans',
    name: 'Off the plans',
    blurb: 'Clear a secret level.',
    need: 1,
    hidden: true,
    count: (save) => tally(save, (record) => record.reach, true),
  },
  {
    id: 'regular',
    name: 'Regular',
    blurb: 'Finish the daily blueprint 3 days running.',
    need: 3,
    count: longestStreak,
  },
  {
    id: 'full-week',
    name: 'Full week',
    blurb: 'Finish the daily blueprint 7 days running.',
    need: 7,
    count: longestStreak,
  },
  {
    id: 'subscriber',
    name: 'Subscriber',
    blurb: 'Finish 15 daily blueprints.',
    need: 15,
    count: dailiesDone,
  },
  {
    id: 'test-pilot',
    name: 'Test pilot',
    blurb: 'Launch 100 times. Failure is free.',
    need: 100,
    count: (save) => save.stats.launches,
  },
  {
    id: 'published',
    name: 'Published',
    blurb: 'Export a level from the workshop.',
    need: 1,
    count: (save) => save.stats.exports,
  },
];

export function featById(id: string): Feat | undefined {
  return FEATS.find((feat) => feat.id === id);
}

export function featEarned(save: SaveData, id: string): boolean {
  return save.feats[id] !== undefined;
}

/** How far along a feat is. An earned feat stays full even if its count later drops. */
export function featProgress(feat: Feat, save: SaveData): { have: number; need: number; done: boolean } {
  const done = featEarned(save, feat.id);
  const have = done ? feat.need : Math.min(feat.need, Math.max(0, feat.count(save)));
  return { have, need: feat.need, done };
}

/** Records every feat the save now meets and returns the ones that just landed. */
export function awardFeats(save: SaveData, now = Date.now()): Feat[] {
  const landed: Feat[] = [];
  for (const feat of FEATS) {
    if (featEarned(save, feat.id) || feat.count(save) < feat.need) continue;
    save.feats[feat.id] = now;
    landed.push(feat);
  }
  return landed;
}
