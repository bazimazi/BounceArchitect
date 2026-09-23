export interface Hit {
  nx: number;
  ny: number;
  pen: number;
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/** Circle against an oriented box. Normal points from the box toward the circle. */
export function circleObb(
  cx: number,
  cy: number,
  r: number,
  bx: number,
  by: number,
  hw: number,
  hh: number,
  rot: number,
): Hit | null {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const dx = cx - bx;
  const dy = cy - by;
  const lx = dx * c + dy * s;
  const ly = -dx * s + dy * c;

  const qx = clamp(lx, -hw, hw);
  const qy = clamp(ly, -hh, hh);
  const rx = lx - qx;
  const ry = ly - qy;
  const d2 = rx * rx + ry * ry;

  if (d2 > r * r) return null;

  if (d2 > 1e-10) {
    const d = Math.sqrt(d2);
    const lnx = rx / d;
    const lny = ry / d;
    return {
      nx: lnx * c - lny * s,
      ny: lnx * s + lny * c,
      pen: r - d,
    };
  }

  const dl = hw - Math.abs(lx);
  const db = hh - Math.abs(ly);
  let lnx = 0;
  let lny = 0;
  let pen = 0;
  if (dl < db) {
    lnx = lx >= 0 ? 1 : -1;
    pen = dl + r;
  } else {
    lny = ly >= 0 ? 1 : -1;
    pen = db + r;
  }
  return {
    nx: lnx * c - lny * s,
    ny: lnx * s + lny * c,
    pen,
  };
}

export function pointInObb(
  px: number,
  py: number,
  bx: number,
  by: number,
  hw: number,
  hh: number,
  rot: number,
  pad = 0,
): boolean {
  const c = Math.cos(rot);
  const s = Math.sin(rot);
  const dx = px - bx;
  const dy = py - by;
  const lx = dx * c + dy * s;
  const ly = -dx * s + dy * c;
  return Math.abs(lx) <= hw + pad && Math.abs(ly) <= hh + pad;
}
