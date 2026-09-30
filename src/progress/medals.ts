export interface Medals {
  reach: boolean;
  lean: boolean;
  swift: boolean;
}

/** Matches the campaign solution check, so a build the tests accept can earn Swift. */
export const SWIFT_GRACE = 0.15;

export function scoreAttempt(
  won: boolean,
  pieces: number,
  time: number,
  target: { pieces: number; seconds: number },
): Medals {
  if (!won) return { reach: false, lean: false, swift: false };
  return {
    reach: true,
    lean: pieces <= target.pieces,
    swift: time <= target.seconds + SWIFT_GRACE,
  };
}

export function mergeMedals(prev: Medals | undefined, next: Medals): Medals {
  return {
    reach: Boolean(prev?.reach || next.reach),
    lean: Boolean(prev?.lean || next.lean),
    swift: Boolean(prev?.swift || next.swift),
  };
}

export function medalCount(medals: Medals | undefined): number {
  if (!medals) return 0;
  return Number(medals.reach) + Number(medals.lean) + Number(medals.swift);
}

/** Ranks are shares of every medal in the game, so new levels never make them easier. */
const RANKS: [number, string][] = [
  [0, 'Apprentice'],
  [0.05, 'Draftsman'],
  [0.15, 'Builder'],
  [0.35, 'Engineer'],
  [0.6, 'Architect'],
  [0.9, 'Master Architect'],
];

function rankNeed(share: number, max: number): number {
  return share === 0 ? 0 : Math.max(1, Math.ceil(share * max));
}

export function rankTitle(medals: number, max: number): string {
  let title = RANKS[0]![1];
  for (const [share, name] of RANKS) if (medals >= rankNeed(share, max)) title = name;
  return title;
}

export function nextRank(medals: number, max: number): { title: string; need: number } | null {
  for (const [share, name] of RANKS) {
    const need = rankNeed(share, max);
    if (medals < need) return { title: name, need: need - medals };
  }
  return null;
}

export function medalNote(
  medals: Medals,
  pieces: number,
  time: number,
  target: { pieces: number; seconds: number },
): string {
  if (!medals.reach) return '';
  const notes: string[] = [];
  if (!medals.lean) notes.push(`Lean wants ${target.pieces} or fewer. This build uses ${pieces}.`);
  if (!medals.swift) notes.push(`Swift wants ${target.seconds.toFixed(1)}s. This run took ${time.toFixed(1)}s.`);
  if (notes.length === 0) return 'Reach, lean, and swift. That is the clean way.';
  return notes.join(' ');
}
