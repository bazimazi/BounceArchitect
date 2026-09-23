import type { Piece } from '../core/types';
import { deg, piece } from './factory';

/** Authored solutions used by tests. Not shown to players. */
export const SOLUTIONS: Record<string, Piece[]> = {
  'w1-gap': [piece('s', 'ramp', 7.5, 4.35, 7.5, 0.22, deg(-30))],
  'w1-turn': [piece('s', 'ramp', 8.25, 4, 5.2, 0.22, deg(-45))],
  'w1-steps': [
    piece('s1', 'ramp', 4.5, 6.5, 4, 0.22, deg(-40)),
    piece('s2', 'ramp', 8, 3.75, 4, 0.22, deg(-40)),
  ],
  'w1-narrow': [piece('s', 'ramp', 7.25, 4.5, 6.5, 0.22, deg(-25))],
  'w1-quiet': [piece('s', 'ramp', 7.75, 4.4, 8, 0.22, deg(-30))],
  'w2-store': [piece('s', 'spring', 4, 1.15, 1.1, 0.48, deg(90), { power: 14 })],
  'w2-angle': [piece('s', 'spring', 2.4, 1.7, 1.2, 0.5, deg(45), { power: 13 })],
  'w2-kick': [piece('s', 'bouncer', 2.7, 1.7, 1.5, 0.34, deg(-32), { power: 13 })],
  'w2-chain': [
    piece('s1', 'spring', 4, 1.05, 1.05, 0.46, deg(90), { power: 13 }),
    piece('s2', 'spring', 4, 4.15, 1.05, 0.46, deg(90), { power: 13 }),
  ],
  'w3-push': [piece('s', 'accelerator', 4.7, 4.45, 2.2, 1.2, 0, { power: 32, max: 11 })],
  'w3-uphill': [piece('s', 'conveyor', 4.9, 2.85, 6.2, 0.28, deg(22), { power: 5.2 })],
  'w3-ferry': [piece('s', 'ramp', 5.4, 5, 4.2, 0.22, deg(-28))],
  'w4-side': [piece('s', 'gravity', 5.5, 4.6, 2.5, 3.4, 0, { power: 28 })],
  'w4-lift': [piece('s', 'gravity', 3.2, 2.7, 2.3, 3.2, deg(90), { power: 20 })],
  'w4-choice': [piece('s', 'gravity', 5.6, 6.35, 2.45, 2.3, 0, { power: 26 })],
  'w5-shortcut': [piece('s', 'ramp', 4.5, 5.15, 3.6, 0.22, deg(-35))],
  'w5-spring': [piece('s', 'spring', 2.6, 1.55, 1.15, 0.48, deg(90), { power: 14 })],
  'w5-pair': [
    piece('in', 'portal', 5.2, 4.4, 0.46, 1.6, deg(-80), { link: 'player' }),
    piece('out', 'portal', 11.2, 3.7, 0.46, 1.6, 0, { link: 'player' }),
  ],
  'w6-cannon': [piece('s', 'cannon', 4.4, 4.35, 1.3, 0.64, deg(42), { power: 14 })],
  'w6-latch': [
    piece('s1', 'ramp', 4.3, 6.05, 3.4, 0.22, deg(-24)),
    piece('s2', 'ramp', 8.1, 3.15, 3.4, 0.22, deg(-48)),
  ],
  'w6-both': [
    piece('s1', 'spring', 3.6, 1.15, 1.1, 0.48, deg(90), { power: 14 }),
    piece('s2', 'spring', 9.4, 1.15, 1.1, 0.48, deg(90), { power: 14 }),
  ],
  'w7-break': [piece('s', 'ramp', 5.5, 6.15, 5.5, 0.22, deg(-30))],
  'w7-hard': [
    piece('s1', 'accelerator', 3.6, 7.2, 2, 1.1, deg(-8), { power: 36, max: 14 }),
    piece('s2', 'ramp', 6.6, 5.4, 4.5, 0.22, deg(-38)),
  ],
};
