import type { Level } from '../core/types';
import { linearLevels, worldOf } from './campaign';
import { isLevelOpen } from '../progress/unlock';
import type { SaveData } from '../progress/save';

const EPOCH = Date.UTC(2026, 0, 1);

export function dayKey(date = new Date()): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

function dayIndex(date: Date): number {
  const utc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  return Math.floor((utc - EPOCH) / 86400000);
}

function pick<T>(pool: T[], index: number): T {
  return pool[((index % pool.length) + pool.length) % pool.length]!;
}

/** The shared blueprint: the same level for everyone on a date, drawn from the whole campaign. */
export function dailyLevel(date = new Date()): Level {
  // A stride coprime with the pool keeps neighbouring days in different worlds
  // and still visits every level before repeating one.
  const pool = linearLevels();
  let stride = 7;
  while (gcd(stride, pool.length) !== 1) stride += 1;
  return pick(pool, dayIndex(date) * stride);
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b);
}

/**
 * The blueprint this player gets today. When the shared one is still ahead of them,
 * they get a stand-in from what they have opened, so the daily is never a locked door.
 */
export function dailyFor(save: SaveData, date = new Date()): { level: Level; shared: boolean } {
  const shared = dailyLevel(date);
  const pinned = linearLevels().find((level) => level.id === save.dailies[dayKey(date)]?.levelId);
  if (pinned) return { level: pinned, shared: pinned.id === shared.id };
  if (isLevelOpen(shared, save)) return { level: shared, shared: true };
  const open = linearLevels().filter((level) => isLevelOpen(level, save));
  return { level: pick(open, dayIndex(date)), shared: false };
}

/** Consecutive days with a finished blueprint, counting back from today (or yesterday). */
export function dailyStreak(save: SaveData, date = new Date()): number {
  const cursor = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  if (!save.dailies[dayKey(cursor)]?.done) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (save.dailies[dayKey(cursor)]?.done) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/** The longest run of consecutive finished blueprints this device has seen. */
export function longestStreak(save: SaveData): number {
  const done = new Set(Object.keys(save.dailies).filter((key) => save.dailies[key]?.done));
  let best = 0;
  for (const key of done) {
    const [year, month, day] = key.split('-').map(Number);
    if (!year || !month || !day) continue;
    const cursor = new Date(year, month - 1, day - 1);
    // Only count from the first day of a run.
    if (done.has(dayKey(cursor))) continue;
    let run = 0;
    cursor.setDate(cursor.getDate() + 1);
    while (done.has(dayKey(cursor))) {
      run += 1;
      cursor.setDate(cursor.getDate() + 1);
    }
    best = Math.max(best, run);
  }
  return best;
}

export function dailiesDone(save: SaveData): number {
  return Object.values(save.dailies).filter((entry) => entry.done).length;
}

export function dailyCard(save: SaveData, date = new Date()) {
  const { level, shared } = dailyFor(save, date);
  const record = save.dailies[dayKey(date)];
  const world = worldOf(level.worldId);
  const streak = dailyStreak(save, date);
  return {
    best: longestStreak(save),
    id: level.id,
    open: true,
    done: Boolean(record?.done && record.levelId === level.id),
    name: level.name,
    world: world?.name ?? '',
    streak,
    blurb: shared
      ? `Today’s shared blueprint, from ${world?.name ?? 'the campaign'}. It counts in the campaign too.`
      : `The shared blueprint is further in. Today’s stand-in comes from ${world?.name ?? 'what you have opened'}.`,
  };
}
