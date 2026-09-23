import { dirOf, upOf } from '../core/math';
import { BALL_R } from '../physics/sim';
import type { Allowance, Level, ObjectKind, Piece, Props, Rect, TrajectoryMode } from '../core/types';

export function piece(
  uid: string,
  kind: ObjectKind,
  x: number,
  y: number,
  w: number,
  h: number,
  rot = 0,
  props: Props = {},
): Piece {
  return { uid, kind, x, y, rot, w, h, props };
}

/** Ball center sitting just above a plank's top surface. */
export function seat(pad: Piece, localX = 0, r = BALL_R): { x: number; y: number } {
  const up = upOf(pad.rot);
  const along = dirOf(pad.rot);
  const lift = pad.h / 2;
  return {
    x: pad.x + along.x * localX + up.x * (lift + r + 0.05),
    y: pad.y + along.y * localX + up.y * (lift + r + 0.05),
  };
}

export function deg(d: number): number {
  return (d * Math.PI) / 180;
}

interface LevelSpec {
  id: string;
  name: string;
  worldId: string;
  summary: string;
  intent: string;
  trajectory?: TrajectoryMode;
  previewSeconds?: number;
  maxTime?: number;
  view?: Rect;
  environment: Piece[];
  starts: { id: string; x: number; y: number }[];
  goals: Level['goals'];
  palette: Allowance[];
  medals: { pieces: number; seconds: number };
  hints: string[];
  secret?: Level['secret'];
}

export function makeLevel(spec: LevelSpec): Level {
  return {
    format: 1,
    id: spec.id,
    name: spec.name,
    worldId: spec.worldId,
    summary: spec.summary,
    intent: spec.intent,
    gravity: 18,
    maxTime: spec.maxTime ?? 14,
    killY: -2.5,
    view: spec.view ?? { x: -0.6, y: -1.2, w: 17.2, h: 11.4 },
    trajectory: spec.trajectory ?? 'full',
    previewSeconds: spec.previewSeconds ?? 2.6,
    starts: spec.starts,
    goals: spec.goals,
    environment: spec.environment,
    palette: spec.palette,
    medals: spec.medals,
    hints: spec.hints,
    ...(spec.secret ? { secret: spec.secret } : {}),
  };
}
