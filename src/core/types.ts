/** Direction convention: local +X is the arrow (springs, belts, portals). Local +Y is the surface normal of a plank. */

export type ObjectKind =
  | 'platform'
  | 'ramp'
  | 'wall'
  | 'spring'
  | 'bouncer'
  | 'accelerator'
  | 'conveyor'
  | 'gravity'
  | 'portal'
  | 'cannon'
  | 'switch'
  | 'door'
  | 'mover'
  | 'spinner'
  | 'breakable'
  | 'oneway';

export type TrajectoryMode = 'full' | 'partial' | 'off';

export type MechanicCategory = 'structure' | 'motion' | 'field' | 'routing' | 'logic';

export interface Props {
  power?: number;
  omega?: number;
  distance?: number;
  period?: number;
  link?: string;
  gate?: string;
  threshold?: number;
  friction?: number;
  restitution?: number;
  max?: number;
}

export interface Piece {
  uid: string;
  kind: ObjectKind;
  x: number;
  y: number;
  rot: number;
  w: number;
  h: number;
  props: Props;
}

export interface BallStart {
  id: string;
  x: number;
  y: number;
  r?: number;
}

export interface Goal {
  id: string;
  x: number;
  y: number;
  r: number;
  ballId?: string;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Allowance {
  kind: ObjectKind;
  count: number;
  w?: number;
  h?: number;
  rot?: number;
  props?: Props;
  label?: string;
}

export interface Level {
  format: 1;
  id: string;
  name: string;
  worldId: string;
  summary: string;
  gravity: number;
  maxTime: number;
  killY: number;
  view: Rect;
  trajectory: TrajectoryMode;
  previewSeconds: number;
  starts: BallStart[];
  goals: Goal[];
  environment: Piece[];
  palette: Allowance[];
  medals: { pieces: number; seconds: number };
  hints: string[];
  intent: string;
  secret?: { needLevel: string; needMedals: number };
}

export interface WorldDef {
  id: string;
  name: string;
  kicker: string;
  lesson: string;
  accent: string;
}

export interface MechanicDef {
  kind: ObjectKind;
  name: string;
  blurb: string;
  category: MechanicCategory;
  w: number;
  h: number;
  rot: number;
  props: Props;
}

export const SOLID_KINDS: ReadonlySet<ObjectKind> = new Set([
  'platform',
  'ramp',
  'wall',
  'bouncer',
  'conveyor',
  'door',
  'mover',
  'spinner',
  'breakable',
  'oneway',
]);

export function isSolid(kind: ObjectKind): boolean {
  return SOLID_KINDS.has(kind);
}
