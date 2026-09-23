import { linearLevels, worldOf } from './campaign';
import { isLevelOpen } from '../progress/unlock';
import type { SaveData } from '../progress/save';

const EPOCH = Date.UTC(2026, 0, 1);

export function dayKey(date = new Date()): string {
  const month = `${date.getMonth() + 1}`.padStart(2, '0');
  const day = `${date.getDate()}`.padStart(2, '0');
  return `${date.getFullYear()}-${month}-${day}`;
}

export function dailyLevel(date = new Date()) {
  const pool = linearLevels().slice(0, 7);
  const utc = Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const index = Math.floor((utc - EPOCH) / 86400000);
  const wrapped = ((index % pool.length) + pool.length) % pool.length;
  return pool[wrapped]!;
}

export function dailyCard(save: SaveData, date = new Date()) {
  const level = dailyLevel(date);
  const open = isLevelOpen(level, save);
  const record = save.dailies[dayKey(date)];
  const world = worldOf(level.worldId);
  return {
    id: level.id,
    open,
    done: Boolean(record?.done && record.levelId === level.id),
    name: open ? level.name : 'Still ahead',
    world: world?.name ?? '',
    blurb: open
      ? 'Same blueprint for everyone today. It still counts in the campaign.'
      : `Today’s blueprint is in ${world?.name ?? 'a later world'}. It opens when you get there.`,
  };
}
