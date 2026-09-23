import { clamp } from '../core/math';
import type { Rect } from '../core/types';

export interface Camera {
  x: number;
  y: number;
  zoom: number;
}

export function fitCamera(
  view: Rect,
  width: number,
  height: number,
  inset: { top: number; bottom: number } = { top: 0, bottom: 0 },
): Camera {
  const usableH = Math.max(80, height - inset.top - inset.bottom);
  const zoom = clamp(
    Math.min(width / Math.max(view.w, 0.01), usableH / Math.max(view.h, 0.01)) * 0.92,
    18,
    140,
  );
  const centerY = view.y + view.h / 2;
  const bandCenter = inset.top + usableH / 2;
  return {
    x: view.x + view.w / 2,
    y: centerY - (height / 2 - bandCenter) / zoom,
    zoom,
  };
}

export function screenToWorld(
  camera: Camera,
  width: number,
  height: number,
  sx: number,
  sy: number,
): { x: number; y: number } {
  return {
    x: (sx - width / 2) / camera.zoom + camera.x,
    y: (height / 2 - sy) / camera.zoom + camera.y,
  };
}

export function worldToScreen(
  camera: Camera,
  width: number,
  height: number,
  x: number,
  y: number,
): { x: number; y: number } {
  return {
    x: (x - camera.x) * camera.zoom + width / 2,
    y: height / 2 - (y - camera.y) * camera.zoom,
  };
}
