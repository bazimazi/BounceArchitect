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

export function rankTitle(medals: number): string {
  if (medals >= 40) return 'Master Architect';
  if (medals >= 28) return 'Architect';
  if (medals >= 16) return 'Engineer';
  if (medals >= 8) return 'Builder';
  if (medals >= 3) return 'Draftsman';
  return 'Apprentice';
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
