export const TAU = Math.PI * 2;

export function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function snap(v: number, step: number): number {
  if (step <= 0) return v;
  return Math.round(v / step) * step;
}

export function snapAngle(rad: number, step: number): number {
  if (step <= 0) return rad;
  const turns = rad / step;
  return Math.round(turns) * step;
}

/** Local +X in world space. Rotation 0 points right; positive rotation is counter-clockwise. */
export function dirOf(rot: number): { x: number; y: number } {
  return { x: Math.cos(rot), y: Math.sin(rot) };
}

/** Local +Y in world space. Rotation 0 points up. */
export function upOf(rot: number): { x: number; y: number } {
  return { x: -Math.sin(rot), y: Math.cos(rot) };
}

export function rotVec(x: number, y: number, ang: number): { x: number; y: number } {
  const c = Math.cos(ang);
  const s = Math.sin(ang);
  return { x: x * c - y * s, y: x * s + y * c };
}

export function dot(ax: number, ay: number, bx: number, by: number): number {
  return ax * bx + ay * by;
}

export function len(x: number, y: number): number {
  return Math.hypot(x, y);
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds)) return '—';
  return `${seconds.toFixed(1)}s`;
}

let counter = 0;

export function uid(prefix = 'p'): string {
  counter += 1;
  return `${prefix}${counter.toString(36)}`;
}
