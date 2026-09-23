import type { ObjectKind } from '../core/types';
import type { SaveData } from '../progress/save';
import { isLevelOpen } from '../progress/unlock';
import { CATALOG } from './catalog';
import { LEVELS } from './campaign';
import { makeLevel, piece, seat } from './factory';
import type { Level } from '../core/types';

const ORDER = Object.keys(CATALOG) as ObjectKind[];

export function knownKinds(save: SaveData): ObjectKind[] {
  const known = new Set<ObjectKind>(['platform', 'ramp', 'wall']);
  for (const level of LEVELS) {
    if (!isLevelOpen(level, save)) continue;
    for (const built of level.environment) known.add(built.kind);
    for (const allowance of level.palette) known.add(allowance.kind);
  }
  return ORDER.filter((kind) => known.has(kind));
}

export function workshopLevel(kinds: ObjectKind[]): Level {
  const stage = piece('stage', 'platform', 6, 0.2, 16, 0.32, 0, { friction: 0.2 });
  const ball = seat(stage, -5);
  return makeLevel({
    id: 'workshop',
    name: 'Untitled bench',
    worldId: 'workshop',
    summary: 'Build a machine, then launch it. Drafts stay on this device.',
    intent: 'A private bench using mechanics the campaign has opened.',
    trajectory: 'full',
    previewSeconds: 3.2,
    maxTime: 18,
    view: { x: -2.2, y: -2.2, w: 18.4, h: 12.4 },
    environment: [stage],
    starts: [{ id: 'a', ...ball }],
    goals: [{ id: 'g', x: 12.2, y: 1.15, r: 0.9 }],
    palette: kinds.map((kind) => {
      const def = CATALOG[kind];
      return {
        kind,
        count: kind === 'portal' ? 4 : 8,
        w: def.w,
        h: def.h,
        rot: def.rot,
        props: { ...def.props },
        label: def.name,
      };
    }),
    medals: { pieces: 99, seconds: 99 },
    hints: ['This bench is yours. The ring is a goal, not a grade.'],
  });
}
