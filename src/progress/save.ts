import type { Level, Piece } from '../core/types';
import type { Medals } from './medals';

export interface Settings {
  music: number;
  sfx: number;
  haptics: boolean;
  reducedMotion: boolean;
  highContrast: boolean;
  uiScale: number;
}

export interface LevelRecord extends Medals {
  bestTime: number;
  bestPieces: number;
  attempts: number;
  hints: number;
}

export interface Draft {
  id: string;
  name: string;
  updated: number;
  level: Level;
  pieces: Piece[];
}

export interface SaveData {
  format: 1;
  levels: Record<string, LevelRecord>;
  seenWorlds: string[];
  settings: Settings;
  drafts: Draft[];
  dailies: Record<string, { levelId: string; done: boolean }>;
  stats: { launches: number; solves: number; hints: number };
}

export interface Store {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export const SAVE_KEY = 'bounce-architect-save-v1';

export function defaultSettings(): Settings {
  const reduced =
    typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  return {
    music: 0.35,
    sfx: 0.8,
    haptics: false,
    reducedMotion: reduced,
    highContrast: false,
    uiScale: 1,
  };
}

export function freshSave(): SaveData {
  return {
    format: 1,
    levels: {},
    seenWorlds: [],
    settings: defaultSettings(),
    drafts: [],
    dailies: {},
    stats: { launches: 0, solves: 0, hints: 0 },
  };
}

export function blankRecord(): LevelRecord {
  return {
    reach: false,
    lean: false,
    swift: false,
    bestTime: Infinity,
    bestPieces: Infinity,
    attempts: 0,
    hints: 0,
  };
}

export function ensureRecord(save: SaveData, id: string): LevelRecord {
  const existing = save.levels[id];
  if (existing) return existing;
  const created = blankRecord();
  save.levels[id] = created;
  return created;
}

export function loadSave(store?: Store): SaveData {
  const source = store ?? browserStore();
  if (!source) return freshSave();
  try {
    const raw = source.getItem(SAVE_KEY);
    if (!raw) return freshSave();
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    if (parsed.format !== 1 || !parsed.levels || !parsed.settings) return freshSave();
    return {
      ...freshSave(),
      ...parsed,
      format: 1,
      settings: { ...defaultSettings(), ...parsed.settings },
      stats: { ...freshSave().stats, ...parsed.stats },
      drafts: parsed.drafts ?? [],
      dailies: parsed.dailies ?? {},
      seenWorlds: parsed.seenWorlds ?? [],
    };
  } catch {
    return freshSave();
  }
}

export function writeSave(save: SaveData, store?: Store): boolean {
  const source = store ?? browserStore();
  if (!source) return false;
  try {
    source.setItem(SAVE_KEY, JSON.stringify(save));
    return true;
  } catch {
    return false;
  }
}

function browserStore(): Store | undefined {
  if (typeof localStorage === 'undefined') return undefined;
  return localStorage;
}
