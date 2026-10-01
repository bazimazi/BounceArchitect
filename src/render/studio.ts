import type { DrawWorld } from './draw';

const TAU = Math.PI * 2;
let backdrop: { key: string; canvas: HTMLCanvasElement } | null = null;

/** Cached room geometry; only its light and dust move from frame to frame. */
export function paintBackdrop(ctx: CanvasRenderingContext2D, input: DrawWorld): void {
  const { width, height, dpr, highContrast } = input;
  if (highContrast) {
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, width, height);
    return;
  }
  const key = `${width}|${height}|${dpr}`;
  if (backdrop?.key !== key) {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(width * dpr));
    canvas.height = Math.max(1, Math.round(height * dpr));
    const g = canvas.getContext('2d');
    if (g) {
      g.scale(dpr, dpr);
      const base = g.createLinearGradient(0, 0, width, height);
      base.addColorStop(0, '#17363D');
      base.addColorStop(0.5, '#0B252D');
      base.addColorStop(1, '#061820');
      g.fillStyle = base;
      g.fillRect(0, 0, width, height);
      // An etched cutting mat beneath the floating board.
      g.lineWidth = 0.6;
      g.strokeStyle = '#B1D5C70A';
      g.beginPath();
      for (let x = 0; x < width; x += 32) { g.moveTo(x, 0); g.lineTo(x, height); }
      for (let y = 0; y < height; y += 32) { g.moveTo(0, y); g.lineTo(width, y); }
      g.stroke();
      const cx = width * 0.88;
      const cy = height * 0.2;
      const radius = Math.min(width, height) * 0.42;
      g.strokeStyle = '#C7D9B916';
      for (const scale of [0.87, 0.94, 1]) {
        g.beginPath(); g.arc(cx, cy, radius * scale, 0, TAU); g.stroke();
      }
      g.beginPath();
      for (let i = 0; i < 120; i++) {
        const angle = i / 120 * TAU;
        const inner = radius * (i % 10 === 0 ? 0.91 : 0.97);
        g.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
        g.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
      }
      g.stroke();
      // Fixed, sparse grain avoids expensive full-screen noise on every frame.
      g.fillStyle = '#DDF3D4';
      for (let i = 0; i < 2400; i++) {
        g.globalAlpha = 0.015 + hash(i, 2) * 0.025;
        g.fillRect(hash(i, 3) * width, hash(i, 5) * height, 1, 1);
      }
      g.globalAlpha = 1;
      backdrop = { key, canvas };
    }
  }
  if (backdrop) ctx.drawImage(backdrop.canvas, 0, 0, width, height);
  const t = input.reducedMotion ? 0 : input.time;
  const lightX = width * (0.6 + Math.sin(t * 0.09) * 0.05);
  const light = ctx.createRadialGradient(lightX, height * 0.3, 0, lightX, height * 0.3, Math.max(width, height) * 0.65);
  light.addColorStop(0, '#76BCAB18');
  light.addColorStop(0.6, '#598E7710');
  light.addColorStop(1, '#10232E00');
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, width, height);
  if (input.reducedMotion) return;
  ctx.save();
  for (let i = 0; i < 28; i++) {
    const x = hash(i, 7) * width + Math.sin(t * 0.14 + i) * 20;
    const y = (1 - (hash(i, 11) + t * (0.003 + hash(i, 13) * 0.006)) % 1) * height;
    const r = 0.5 + hash(i, 17) * 1.2;
    ctx.globalAlpha = (0.12 + Math.sin(t * 0.6 + i) * 0.08);
    ctx.fillStyle = i % 3 === 0 ? '#F5CE90' : '#B4EFDB';
    ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill();
  }
  ctx.restore();
}

/** A beveled instrument case surrounding a translucent drafting surface. */
export function drawTable(ctx: CanvasRenderingContext2D, input: DrawWorld): void {
  if (input.highContrast) return;
  const { view } = input.level;
  const z = input.camera.zoom;
  const pad = 0.28;
  const x = view.x - pad;
  const y = view.y - pad;
  const w = view.w + pad * 2;
  const h = view.h + pad * 2;
  const live = input.fx.modeBlend;
  ctx.save();
  // Deep lower extrusion and a crisp lit upper bevel give actual depth.
  ctx.shadowColor = '#00000080';
  ctx.shadowBlur = 35;
  ctx.shadowOffsetY = 18;
  ctx.fillStyle = '#06181E';
  ctx.beginPath(); ctx.roundRect(x - 0.08, y - 0.14, w + 0.16, h + 0.15, 0.25); ctx.fill();
  ctx.shadowColor = 'transparent';
  const rim = ctx.createLinearGradient(x, y + h, x + w, y);
  rim.addColorStop(0, '#63837B');
  rim.addColorStop(0.2, '#294C50');
  rim.addColorStop(0.8, '#163A42');
  rim.addColorStop(1, '#899480');
  ctx.fillStyle = rim;
  ctx.beginPath(); ctx.roundRect(x - 0.08, y - 0.04, w + 0.16, h + 0.12, 0.25); ctx.fill();
  const surface = ctx.createLinearGradient(x, y + h, x + w * 0.6, y);
  surface.addColorStop(0, '#1B4049');
  surface.addColorStop(0.55, '#14353E');
  surface.addColorStop(1, '#102C35');
  ctx.fillStyle = surface;
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 0.19); ctx.fill();
  ctx.strokeStyle = '#BCD9BD40';
  ctx.lineWidth = 1 / z;
  ctx.stroke();

  ctx.save();
  ctx.clip();
  const aura = ctx.createRadialGradient(view.x + view.w * 0.75, view.y + view.h * 0.65, 0, view.x + view.w * 0.75, view.y + view.h * 0.65, view.w * 0.65);
  aura.addColorStop(0, `${input.accent}18`);
  aura.addColorStop(1, `${input.accent}00`);
  ctx.fillStyle = aura;
  ctx.fillRect(x, y, w, h);
  // Only the build stage has a very slow scanning light, with no sharp edge.
  if (!input.reducedMotion && live < 0.95) {
    const scanY = y + ((input.time * 0.18) % (h + 3)) - 1.5;
    const scan = ctx.createLinearGradient(0, scanY - 1.2, 0, scanY + 1.2);
    scan.addColorStop(0, '#ABDAC500');
    scan.addColorStop(0.5, `rgba(171,218,197,${0.025 * (1 - live)})`);
    scan.addColorStop(1, '#ABDAC500');
    ctx.fillStyle = scan;
    ctx.fillRect(x, scanY - 1.2, w, 2.4);
  }
  ctx.restore();
  // Brass screws and illuminated corner registration marks.
  for (const sx of [x + 0.14, x + w - 0.14]) {
    for (const sy of [y + 0.14, y + h - 0.14]) {
      const screw = ctx.createRadialGradient(sx - 0.015, sy + 0.02, 0, sx, sy, 0.058);
      screw.addColorStop(0, '#E7D2A3'); screw.addColorStop(1, '#4C5341');
      ctx.fillStyle = screw;
      ctx.beginPath(); ctx.arc(sx, sy, 0.055, 0, TAU); ctx.fill();
      ctx.strokeStyle = '#142D30'; ctx.lineWidth = 1 / z;
      ctx.beginPath(); ctx.moveTo(sx - 0.024, sy - 0.014); ctx.lineTo(sx + 0.024, sy + 0.014); ctx.stroke();
    }
  }
  ctx.strokeStyle = live > 0.1 ? '#A7E7CBA0' : '#D9C49370';
  ctx.lineWidth = 1.5 / z;
  const arm = 0.32;
  for (const [cx, cy, dx, dy] of [[view.x, view.y, 1, 1], [view.x + view.w, view.y, -1, 1], [view.x, view.y + view.h, 1, -1], [view.x + view.w, view.y + view.h, -1, -1]]) {
    ctx.beginPath(); ctx.moveTo(cx, cy + arm * dy); ctx.lineTo(cx, cy); ctx.lineTo(cx + arm * dx, cy); ctx.stroke();
  }
  ctx.restore();
}

function hash(i: number, salt: number): number {
  const n = Math.sin(i * 127.1 + salt * 311.7) * 43758.5453;
  return n - Math.floor(n);
}
