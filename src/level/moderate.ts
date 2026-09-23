const BLOCKED = ['fuck', 'shit', 'bitch', 'cunt', 'nigger', 'nigga', 'faggot', 'retard'];

export function isClean(text: string): boolean {
  const lowered = text.toLowerCase();
  return !BLOCKED.some((word) => lowered.includes(word));
}

export function cleanTitle(text: string): string {
  return text.replace(/\s+/g, ' ').trim().slice(0, 48);
}
