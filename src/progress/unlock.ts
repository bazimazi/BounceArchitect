import type { Level } from '../core/types';
import { LEVELS, levelsInWorld, linearLevels, WORLDS } from '../level/campaign';
import { medalCount } from './medals';
import type { SaveData } from './save';

/** How many levels a world lets you leave behind before the next world opens. */
export const WORLD_SLACK = 1;

/** Reached, or passed with a skip. Either one moves the campaign forward. */
export function isCleared(save: SaveData, id: string): boolean {
  const record = save.levels[id];
  return Boolean(record?.reach || record?.passed);
}

function worldLinear(worldId: string): Level[] {
  return levelsInWorld(worldId).filter((level) => !level.secret);
}

export function clearedInWorld(worldId: string, save: SaveData): number {
  return worldLinear(worldId).filter((level) => isCleared(save, level.id)).length;
}

/** Clears a world needs before the one after it opens. */
export function clearsToAdvance(worldId: string): number {
  return Math.max(1, worldLinear(worldId).length - WORLD_SLACK);
}

export function isWorldOpen(worldId: string, save: SaveData): boolean {
  const index = WORLDS.findIndex((world) => world.id === worldId);
  if (index <= 0) return true;
  const previous = WORLDS[index - 1]!;
  return isWorldOpen(previous.id, save) && clearedInWorld(previous.id, save) >= clearsToAdvance(previous.id);
}

/**
 * The first level of a world teaches its mechanic, so it opens alone. After that the
 * world keeps one extra level open beyond the next, so a stuck puzzle is never a wall.
 */
export function isLevelOpen(level: Level, save: SaveData): boolean {
  if (level.secret) {
    const need = save.levels[level.secret.needLevel];
    return medalCount(need) >= level.secret.needMedals;
  }
  if (!isWorldOpen(level.worldId, save)) return false;
  const linear = worldLinear(level.worldId);
  const index = linear.findIndex((entry) => entry.id === level.id);
  if (index <= 0) return true;
  if (!isCleared(save, linear[0]!.id)) return false;
  return clearedInWorld(level.worldId, save) >= index - 1;
}

/** What still stands between the player and a locked level, in plain words. */
export function lockReason(level: Level, save: SaveData): string {
  if (level.secret) return 'Secret';
  const index = WORLDS.findIndex((world) => world.id === level.worldId);
  if (!isWorldOpen(level.worldId, save) && index > 0) {
    const previous = WORLDS[index - 1]!;
    const left = clearsToAdvance(previous.id) - clearedInWorld(previous.id, save);
    return left > 0 ? `Clear ${left} more in ${previous.name}` : `Open ${previous.name} first`;
  }
  const linear = worldLinear(level.worldId);
  const at = linear.findIndex((entry) => entry.id === level.id);
  const first = linear[0];
  if (first && !isCleared(save, first.id)) return `Clear ${first.name} first`;
  const left = at - 1 - clearedInWorld(level.worldId, save);
  return `Clear ${Math.max(1, left)} more here`;
}

export function openLevelIds(save: SaveData): Set<string> {
  return new Set(LEVELS.filter((level) => isLevelOpen(level, save)).map((level) => level.id));
}

/**
 * Where to go after a level. Prefers the next open, uncleared level after this one,
 * then any open uncleared level, then a passed level still waiting for its Reach.
 */
export function nextLevelId(currentId: string, save: SaveData): string | undefined {
  const linear = linearLevels();
  const index = linear.findIndex((entry) => entry.id === currentId);
  const ordered = index >= 0 ? [...linear.slice(index + 1), ...linear.slice(0, index)] : linear;
  const open = ordered.filter((level) => level.id !== currentId && isLevelOpen(level, save));
  return (open.find((level) => !isCleared(save, level.id)) ?? open.find((level) => !save.levels[level.id]?.reach))?.id;
}

/** The level Continue opens. Undefined once every open level has its Reach. */
export function firstUnsolved(save: SaveData): string | undefined {
  const open = linearLevels().filter((level) => isLevelOpen(level, save));
  return (open.find((level) => !isCleared(save, level.id)) ?? open.find((level) => !save.levels[level.id]?.reach))?.id;
}

export function secretFrom(levelId: string, save: SaveData): Level | undefined {
  return LEVELS.find((level) => level.secret?.needLevel === levelId && isLevelOpen(level, save));
}

export function totalMedals(save: SaveData): number {
  return LEVELS.reduce((sum, level) => sum + medalCount(save.levels[level.id]), 0);
}

export function campaignDone(save: SaveData): boolean {
  return linearLevels().every((level) => save.levels[level.id]?.reach);
}
