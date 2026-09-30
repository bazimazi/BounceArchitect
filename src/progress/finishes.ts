/**
 * Ball finishes are the reward for chasing Lean and Swift. Most open at a medal total.
 * A few open with a feat instead, so a streak or a perfected world shows on the ball.
 */
export interface Finish {
  id: string;
  name: string;
  need: number;
  /** Opens with this feat instead of a medal total. */
  feat?: string;
  /** The painted band that shows the ball rolling. */
  band: string;
  /** Radial body gradient, light to dark. */
  body: [string, string, string];
}

/** What a finish can open with. */
export interface Unlocks {
  medals: number;
  feats: Record<string, number>;
}

export const FINISHES: Finish[] = [
  { id: 'workshop', name: 'Workshop', need: 0, band: '#EA580C', body: ['#6D7C8E', '#243140', '#0B1016'] },
  { id: 'brass', name: 'Brass', need: 6, band: '#F59E0B', body: ['#8A7A5C', '#3B3222', '#15110A'] },
  { id: 'tide', name: 'Tidewater', need: 15, band: '#14B8A6', body: ['#5E8A8C', '#1C3A40', '#081518'] },
  { id: 'dusk', name: 'Dusk', need: 27, band: '#A78BFA', body: ['#7A6E96', '#2B2244', '#0E0A18'] },
  { id: 'rose', name: 'Rosewood', need: 42, band: '#FB7185', body: ['#9A6A6E', '#4A2228', '#1A0A0D'] },
  { id: 'gilded', name: 'Gilded', need: 60, band: '#1B2430', body: ['#FFF3C4', '#E0A21A', '#7A4A06'] },
  { id: 'chalk', name: 'Chalk', need: 0, feat: 'no-notes', band: '#1B2430', body: ['#FFFFFF', '#C9CFD6', '#5E6874'] },
  { id: 'ember', name: 'Ember', need: 0, feat: 'full-week', band: '#FDBA74', body: ['#B8664A', '#5A2412', '#1F0A04'] },
  { id: 'blueprint', name: 'Blueprint', need: 0, feat: 'signature', band: '#BFDBFE', body: ['#5B7BA8', '#1E3A66', '#0A1528'] },
  { id: 'obsidian', name: 'Obsidian', need: 0, feat: 'off-the-plans', band: '#C084FC', body: ['#4A4458', '#15121C', '#050407'] },
];

export function finishById(id: string): Finish {
  return FINISHES.find((finish) => finish.id === id) ?? FINISHES[0]!;
}

export function finishOpen(finish: Finish, unlocks: Unlocks): boolean {
  if (finish.feat) return unlocks.feats[finish.feat] !== undefined;
  return unlocks.medals >= finish.need;
}

/** The finish to draw: the chosen one if it is earned, otherwise the default. */
export function activeFinish(id: string, unlocks: Unlocks): Finish {
  const chosen = finishById(id);
  return finishOpen(chosen, unlocks) ? chosen : FINISHES[0]!;
}

/** Finishes that were shut before and are open now. */
export function finishesOpened(before: Unlocks, after: Unlocks): Finish[] {
  return FINISHES.filter((finish) => !finishOpen(finish, before) && finishOpen(finish, after));
}
