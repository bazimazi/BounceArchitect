import type { ObjectKind, Piece } from '../core/types';

export interface Material {
  friction: number;
  restitution: number;
}

const BASE: Partial<Record<ObjectKind, Material>> = {
  platform: { friction: 0.36, restitution: 0.06 },
  ramp: { friction: 0.04, restitution: 0.04 },
  wall: { friction: 0.16, restitution: 0.1 },
  bouncer: { friction: 0.18, restitution: 0 },
  conveyor: { friction: 2.2, restitution: 0 },
  door: { friction: 0.28, restitution: 0.04 },
  mover: { friction: 0.42, restitution: 0.02 },
  spinner: { friction: 0.22, restitution: 0.04 },
  breakable: { friction: 0.28, restitution: 0.03 },
  oneway: { friction: 0.38, restitution: 0.02 },
};

export function materialOf(piece: Piece): Material {
  const base = BASE[piece.kind] ?? { friction: 0.3, restitution: 0.08 };
  return {
    friction: piece.props.friction ?? base.friction,
    restitution: piece.props.restitution ?? base.restitution,
  };
}
