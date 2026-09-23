import type { Level } from '../core/types';
import { LEVELS, linearLevels } from '../level/campaign';
import { medalCount } from './medals';
import type { SaveData } from './save';

export function isLevelOpen(level: Level, save: SaveData): boolean {
  if (level.secret) {
    const need = save.levels[level.secret.needLevel];
    return medalCount(need) >= level.secret.needMedals;
  }
  const linear = linearLevels();
  const index = linear.findIndex((entry) => entry.id === level.id);
  if (index <= 0) return true;
  const previous = linear[index - 1];
  return Boolean(previous && save.levels[previous.id]?.reach);
}

export function nextLinearId(currentId: string): string | undefined {
  const linear = linearLevels();
  const index = linear.findIndex((entry) => entry.id === currentId);
  return linear[index + 1]?.id;
}

export function secretFrom(levelId: string, save: SaveData): Level | undefined {
  return LEVELS.find((level) => level.secret?.needLevel === levelId && isLevelOpen(level, save));
}

export function totalMedals(save: SaveData): number {
  return Object.values(save.levels).reduce((sum, record) => sum + medalCount(record), 0);
}

export function firstUnsolved(save: SaveData): string {
  for (const level of linearLevels()) {
    if (!save.levels[level.id]?.reach) return level.id;
  }
  return linearLevels()[0]?.id ?? 'w1-gap';
}
