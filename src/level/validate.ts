import type { Level, Piece } from '../core/types';
import { isClean } from './moderate';

export interface Issue {
  severity: 'error' | 'warn';
  message: string;
}

export function validateBuild(level: Level, pieces: Piece[]): Issue[] {
  const issues: Issue[] = [];
  if (!level || level.format !== 1) {
    return [{ severity: 'error', message: 'This level uses an unknown format.' }];
  }
  if (!level.starts?.length) issues.push({ severity: 'error', message: 'Add at least one ball.' });
  if (!level.goals?.length) issues.push({ severity: 'error', message: 'Add a goal ring.' });
  if (!isClean(`${level.name ?? ''} ${level.summary ?? ''}`)) {
    issues.push({ severity: 'error', message: 'Choose a different name.' });
  }
  if (!level.name?.trim()) issues.push({ severity: 'warn', message: 'Name this level before you share it.' });

  const all = [...(level.environment ?? []), ...pieces];
  const ids = new Set<string>();
  for (const piece of all) {
    if (ids.has(piece.uid)) issues.push({ severity: 'error', message: 'Two objects share an id.' });
    ids.add(piece.uid);
    if (!Number.isFinite(piece.x) || !Number.isFinite(piece.y) || !Number.isFinite(piece.rot)) {
      issues.push({ severity: 'error', message: 'An object has a broken position.' });
    }
  }
  if (all.length > 80) issues.push({ severity: 'warn', message: 'This is a heavy level. It may run slowly.' });

  const links = new Map<string, number>();
  for (const piece of all) {
    if (piece.kind === 'portal' && piece.props.link) {
      links.set(piece.props.link, (links.get(piece.props.link) ?? 0) + 1);
    }
    if (piece.kind === 'door') {
      const gate = piece.props.gate;
      const linked = Boolean(gate && all.some((other) => other.uid === gate && other.kind === 'switch'));
      if (!linked) issues.push({ severity: 'warn', message: 'A door has no switch.' });
    }
  }
  for (const count of links.values()) {
    if (count !== 2) issues.push({ severity: 'warn', message: 'A portal is missing its pair.' });
  }
  for (const goal of level.goals ?? []) {
    if (!(goal.r > 0)) issues.push({ severity: 'error', message: 'A goal ring has no size.' });
  }
  return issues;
}

export function parseLevel(raw: string): { level?: Level; error?: string } {
  try {
    const data = JSON.parse(raw) as Level;
    if (!data || data.format !== 1 || !Array.isArray(data.environment) || !Array.isArray(data.goals)) {
      return { error: 'This file is not a Bounce Architect level.' };
    }
    const issues = validateBuild(data, []);
    const blocking = issues.find((issue) => issue.severity === 'error');
    if (blocking) return { error: blocking.message };
    return { level: data };
  } catch {
    return { error: 'That file could not be read.' };
  }
}
