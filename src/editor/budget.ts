import type { Allowance, Piece, Props } from '../core/types';

export function sameAllowance(piece: Piece, allowance: Allowance): boolean {
  if (piece.kind !== allowance.kind) return false;
  if (allowance.w !== undefined && Math.abs(piece.w - allowance.w) > 0.02) return false;
  if (allowance.h !== undefined && Math.abs(piece.h - allowance.h) > 0.02) return false;
  const props = allowance.props ?? {};
  for (const key of Object.keys(props) as (keyof Props)[]) {
    if (piece.props[key] !== props[key]) return false;
  }
  return true;
}

export function allowanceIndex(piece: Piece, palette: Allowance[]): number {
  return palette.findIndex((allowance) => sameAllowance(piece, allowance));
}

export function remaining(pieces: Piece[], palette: Allowance[], index: number): number {
  const allowance = palette[index];
  if (!allowance) return 0;
  const matched = pieces.filter((piece) => allowanceIndex(piece, palette) === index);
  if (allowance.kind === 'portal') {
    const links = new Set(matched.map((piece) => piece.props.link ?? piece.uid));
    return allowance.count - links.size;
  }
  return allowance.count - matched.length;
}
