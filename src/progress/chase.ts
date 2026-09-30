import { LEVELS } from '../level/campaign';
import { SWIFT_GRACE } from './medals';
import type { SaveData } from './save';
import { isLevelOpen } from './unlock';

export interface Chase {
  levelId: string;
  medal: 'lean' | 'swift';
  /** How far off the best build is, in plain words. */
  note: string;
  /** Share of the target still to close. Smaller is closer. */
  gap: number;
}

/**
 * Medals the player has come close to, closest first, one per level. Only levels
 * already reached count, since a best build is what tells us how close they are.
 */
export function chaseList(save: SaveData, limit = 3): Chase[] {
  const best = new Map<string, Chase>();
  const offer = (entry: Chase) => {
    const held = best.get(entry.levelId);
    if (!held || entry.gap < held.gap) best.set(entry.levelId, entry);
  };
  for (const level of LEVELS) {
    const record = save.levels[level.id];
    if (!record?.reach || !isLevelOpen(level, save)) continue;
    const target = level.medals;
    if (!record.lean && Number.isFinite(record.bestPieces)) {
      const over = Math.max(1, record.bestPieces - target.pieces);
      offer({
        levelId: level.id,
        medal: 'lean',
        note: `${over} piece${over === 1 ? '' : 's'} over Lean`,
        gap: over / Math.max(1, target.pieces),
      });
    }
    if (!record.swift && Number.isFinite(record.bestTime)) {
      const over = Math.max(0.1, record.bestTime - target.seconds - SWIFT_GRACE);
      offer({
        levelId: level.id,
        medal: 'swift',
        note: `${over.toFixed(1)}s over Swift`,
        gap: over / Math.max(0.1, target.seconds),
      });
    }
  }
  return [...best.values()].sort((a, b) => a.gap - b.gap).slice(0, limit);
}
