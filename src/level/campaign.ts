import type { Level, WorldDef } from '../core/types';
import { deg, makeLevel, piece, seat } from './factory';

export const WORLDS: WorldDef[] = [
  {
    id: 'first',
    name: 'First Bounce',
    kicker: 'World 1',
    lesson: 'The ball only does what the world tells it to. Shape the world.',
    accent: '#C2410C',
  },
  {
    id: 'springs',
    name: 'Springworks',
    kicker: 'World 2',
    lesson: 'Springs throw the ball along their arrow at a speed you can learn.',
    accent: '#B45309',
  },
  {
    id: 'momentum',
    name: 'Momentum',
    kicker: 'World 3',
    lesson: 'Speed is a material. Add it, spend it, or let a ferry carry it.',
    accent: '#1D4ED8',
  },
  {
    id: 'gravity',
    name: 'Gravity Lab',
    kicker: 'World 4',
    lesson: 'Inside a field, down is whichever way the arrow says.',
    accent: '#6D28D9',
  },
  {
    id: 'gates',
    name: 'Gateways',
    kicker: 'World 5',
    lesson: 'A portal is a door with an opinion about direction.',
    accent: '#BE185D',
  },
  {
    id: 'machines',
    name: 'Machines',
    kicker: 'World 6',
    lesson: 'Machines wait for the ball, then they answer.',
    accent: '#0F766E',
  },
  {
    id: 'fragile',
    name: 'Fragile',
    kicker: 'World 7',
    lesson: 'Some parts of the world are meant to fail.',
    accent: '#9F1239',
  },
];

const view = { x: -0.8, y: -1.4, w: 17.6, h: 11.8 };

function levels(): Level[] {
  const gapLip = piece('lip', 'ramp', 2.3, 7.15, 3.4, 0.24, deg(-12), { friction: 0.03 });
  const gapBall = seat(gapLip, -1.05);

  const turnLane = piece('lane', 'ramp', 3.1, 6.55, 5.2, 0.24, deg(-6), { friction: 0.025 });
  const turnBall = seat(turnLane, -1.9);

  const stepLip = piece('slip', 'ramp', 1.7, 8.15, 2.6, 0.24, deg(-10), { friction: 0.03 });
  const stepBall = seat(stepLip, -0.7);

  const narrowLip = piece('nlip', 'ramp', 2.1, 7.5, 3.1, 0.24, deg(-8), { friction: 0.03 });
  const narrowBall = seat(narrowLip, -0.9);

  const quietLip = piece('qlip', 'ramp', 2.2, 7.3, 3.2, 0.24, deg(-10), { friction: 0.03 });
  const quietBall = seat(quietLip, -0.9);

  const storeFloor = piece('floor', 'platform', 4, 0.85, 2.2, 0.28);
  const storeBall = seat(storeFloor, 0);

  const angleFloor = piece('afloor', 'platform', 2.4, 1.45, 2.4, 0.28, 0, { friction: 0.5 });
  const angleBall = seat(angleFloor, 0);

  const chainFloor = piece('cfloor', 'platform', 4, 0.7, 2.2, 0.28);
  const chainBall = seat(chainFloor, 0);

  const pushLip = piece('plip', 'ramp', 1.55, 4.35, 2.5, 0.22, deg(-8), { friction: 0.02 });
  const pushBall = seat(pushLip, -0.7);

  const ferryLip = piece('flip', 'ramp', 2, 6.7, 2.8, 0.24, deg(-14), { friction: 0.03 });
  const ferryBall = seat(ferryLip, -0.8);

  const sideLip = piece('slip2', 'ramp', 2.4, 8.2, 2.8, 0.24, deg(-18), { friction: 0.03 });
  const sideBall = seat(sideLip, -0.6);

  const liftFloor = piece('lfloor', 'platform', 3.2, 1.1, 2.2, 0.28);
  const liftBall = seat(liftFloor, 0);

  const choiceLip = piece('clip', 'ramp', 2.3, 8.4, 2.6, 0.24, deg(-16), { friction: 0.03 });
  const choiceBall = seat(choiceLip, -0.55);

  const shortLip = piece('inlip', 'ramp', 1.8, 6.8, 2.8, 0.24, deg(-12), { friction: 0.03 });
  const shortBall = seat(shortLip, -0.75);

  const portSpringFloor = piece('psfloor', 'platform', 2.6, 1.2, 2.2, 0.28);
  const portSpringBall = seat(portSpringFloor, 0);

  const pairLip = piece('pairlip', 'ramp', 1.6, 6.4, 2.4, 0.22, deg(-10), { friction: 0.03 });
  const pairBall = seat(pairLip, -0.6);

  const cannonLip = piece('canlip', 'ramp', 2, 5.4, 3.2, 0.24, deg(-12), { friction: 0.03 });
  const cannonBall = seat(cannonLip, -0.9);

  const latchPad = piece('lpad', 'ramp', 1.7, 7.1, 2.6, 0.24, deg(-16), { friction: 0.03 });
  const latchBall = seat(latchPad, -0.6);

  const breakLip = piece('blip', 'ramp', 2, 7.6, 2.8, 0.24, deg(-8), { friction: 0.03 });
  const breakBall = seat(breakLip, -0.7);

  const hardLip = piece('hlip', 'ramp', 1.8, 7.8, 2.4, 0.22, deg(-6), { friction: 0.04 });
  const hardBall = seat(hardLip, -0.5);

  return [
    makeLevel({
      id: 'w1-gap',
      name: 'The First Gap',
      worldId: 'first',
      summary: 'Place a ramp. Send the ball to the ring.',
      intent: 'One ramp, full preview, generous ring. Teach place and launch.',
      view,
      environment: [
        gapLip,
        piece('floor', 'platform', 12.5, 1.15, 7, 0.32, 0, { friction: 0.18 }),
        piece('stop', 'wall', 15.75, 2.3, 0.28, 2.5),
      ],
      starts: [{ id: 'a', ...gapBall }],
      goals: [{ id: 'g', x: 13.6, y: 2.35, r: 1.55 }],
      palette: [{ kind: 'ramp', count: 1, w: 7.5, h: 0.22, label: 'Ramp' }],
      medals: { pieces: 1, seconds: 8 },
      hints: [
        'The ring is the goal. Get the ball inside it.',
        'You have one ramp. It is the whole toolbox.',
        'Slope it down toward the ring. The dotted path updates as you aim.',
        'Lean the ramp down to the right so it bridges the ledge and the lower floor.',
        'A single ramp, about a 30° drop, from the lip of the start ledge onto the floor.',
      ],
    }),
    makeLevel({
      id: 'w1-turn',
      name: 'The Turn',
      worldId: 'first',
      summary: 'The lane runs past the ring. Bend the path.',
      intent: 'An angled ramp redirects a rolling ball into a side basin.',
      view,
      environment: [
        turnLane,
        piece('basin', 'platform', 11.8, 1.3, 5.4, 0.3, 0, { friction: 0.28 }),
        piece('br', 'wall', 14.6, 2.25, 0.26, 2.1),
      ],
      starts: [{ id: 'a', ...turnBall }],
      goals: [{ id: 'g', x: 12.4, y: 2.15, r: 1.15 }],
      palette: [{ kind: 'ramp', count: 1, w: 5.2, h: 0.22, label: 'Ramp' }],
      medals: { pieces: 1, seconds: 8 },
      hints: [
        'The ring sits in the basin, off the lane.',
        'A ramp can be a redirect, not only a bridge.',
        'Catch the ball where the lane ends and slope down into the basin.',
        'Steepen the ramp until the dotted path falls between the basin walls.',
        'One ramp at the end of the lane, dropping toward the basin.',
      ],
    }),
    makeLevel({
      id: 'w1-steps',
      name: 'Two Steps',
      worldId: 'first',
      summary: 'One ramp cannot span this. Chain two.',
      intent: 'Two short ramps in series. Introduces piece count as a real limit.',
      view,
      environment: [
        stepLip,
        piece('floor', 'platform', 11.6, 1.2, 4.6, 0.3, 0, { friction: 0.22 }),
        piece('stop', 'wall', 13.7, 2.25, 0.28, 2.3),
      ],
      starts: [{ id: 'a', ...stepBall }],
      goals: [{ id: 'g', x: 12.3, y: 2.15, r: 1.15 }],
      palette: [{ kind: 'ramp', count: 2, w: 4, h: 0.22, label: 'Ramp' }],
      medals: { pieces: 2, seconds: 9 },
      hints: [
        'The lower floor holds the ring. The drop is too long for one ramp.',
        'You have two ramps. Use both.',
        'End the first ramp where the second can catch the ball.',
        'Keep both ramps sloping the same way, like a broken staircase.',
        'Two downward ramps, end to end, from the ledge toward the floor.',
      ],
    }),
    makeLevel({
      id: 'w1-narrow',
      name: 'The Narrow Ring',
      worldId: 'first',
      summary: 'The ring is smaller. Aim the end of the ramp.',
      intent: 'Precision with the preview still on. A smaller ring on a short ledge.',
      view,
      environment: [
        narrowLip,
        piece('floor', 'platform', 12.1, 2.55, 3.4, 0.28, 0, { friction: 0.2 }),
        piece('stop', 'wall', 13.9, 3.45, 0.26, 2),
      ],
      starts: [{ id: 'a', ...narrowBall }],
      goals: [{ id: 'g', x: 12.4, y: 3.25, r: 0.72 }],
      palette: [{ kind: 'ramp', count: 1, w: 6.5, h: 0.22, label: 'Ramp' }],
      medals: { pieces: 1, seconds: 8 },
      hints: [
        'The ring is smaller than the ones before it, and it sits on a short ledge.',
        'Watch the dotted path, not just the ramp.',
        'Aim the lower end of the ramp onto that ledge.',
        'Small nudges matter more than a new piece. You only have one.',
        'One ramp, sloping down to the right, ending above the ledge.',
      ],
    }),
    makeLevel({
      id: 'w1-quiet',
      name: 'The Quiet Line',
      worldId: 'first',
      summary: 'No preview. There is a calm way across.',
      intent: 'Secret. Same idea as the first gap without the path preview. Elegance medal is one piece.',
      trajectory: 'off',
      previewSeconds: 0,
      secret: { needLevel: 'w1-narrow', needMedals: 3 },
      view,
      environment: [
        quietLip,
        piece('floor', 'platform', 12.6, 1.2, 6.4, 0.3, 0, { friction: 0.16 }),
        piece('stop', 'wall', 15.6, 2.3, 0.28, 2.4),
      ],
      starts: [{ id: 'a', ...quietBall }],
      goals: [{ id: 'g', x: 13.5, y: 2.2, r: 1.35 }],
      palette: [
        { kind: 'ramp', count: 1, w: 8, h: 0.22, label: 'Long ramp' },
        { kind: 'ramp', count: 2, w: 2.6, h: 0.22, label: 'Short ramp' },
      ],
      medals: { pieces: 1, seconds: 8 },
      hints: [
        'The ring is on the lower floor, as before.',
        'You can solve this with the long ramp alone.',
        'Picture the first gap. The slope you want is similar.',
        'Short ramps work too. The lean medal wants the single long line.',
        'One long ramp, sloping down to the right, from the ledge to the floor.',
      ],
    }),
    makeLevel({
      id: 'w2-store',
      name: 'Stored Energy',
      worldId: 'springs',
      summary: 'Springs store energy. Place one beneath the ball.',
      intent: 'Vertical spring, shaft walls, one-way shelf. The arrow already points up.',
      view: { x: 0.4, y: -0.6, w: 8.2, h: 10.4 },
      environment: [
        storeFloor,
        piece('left', 'wall', 2.7, 3.6, 0.28, 6.4),
        piece('right', 'wall', 5.3, 3.6, 0.28, 6.4),
        piece('shelf', 'oneway', 4, 4.55, 1.85, 0.18),
      ],
      starts: [{ id: 'a', ...storeBall }],
      goals: [{ id: 'g', x: 4, y: 5.15, r: 0.58 }],
      palette: [{ kind: 'spring', count: 1, w: 1.1, h: 0.48, rot: deg(90), props: { power: 14 }, label: 'Spring' }],
      medals: { pieces: 1, seconds: 6 },
      hints: [
        'The ring sits on the chevron shelf. The ball can pass up through it.',
        'A spring throws along its arrow. This one already points up.',
        'Put the spring under the ball, then launch.',
        'The walls keep the ball in the shaft. You only have to supply the throw.',
        'Place the spring on the floor, under the ball, and leave the arrow pointing up.',
      ],
    }),
    makeLevel({
      id: 'w2-angle',
      name: 'Along the Arrow',
      worldId: 'springs',
      summary: 'The arrow is the launch. Turn it.',
      intent: 'Rotate a spring to 45° to land in a side basket.',
      view,
      environment: [
        angleFloor,
        piece('bucket', 'platform', 12.2, 1.25, 4.4, 0.3, 0, { friction: 0.35 }),
        piece('bl', 'wall', 9.85, 2.4, 0.26, 2.5),
        piece('br', 'wall', 14.55, 2.55, 0.26, 2.8),
      ],
      starts: [{ id: 'a', ...angleBall }],
      goals: [{ id: 'g', x: 12.2, y: 2.2, r: 1.2 }],
      palette: [{ kind: 'spring', count: 1, w: 1.2, h: 0.5, rot: deg(90), props: { power: 13 }, label: 'Spring' }],
      medals: { pieces: 1, seconds: 6 },
      hints: [
        'The basket is to the right, not above the ball.',
        'Rotate the spring. The arrow is the direction of the throw.',
        'Try an even diagonal. Too steep falls short. Too flat never rises.',
        'Fifteen-degree snaps are enough. You do not need a perfect angle.',
        'Point the spring up and to the right, near 45°, from under the ball.',
      ],
    }),
    makeLevel({
      id: 'w2-kick',
      name: 'The Kick',
      worldId: 'springs',
      summary: 'A bouncer kicks along its stripe.',
      intent: 'Angled bouncer redirects a drop into a raised basket.',
      view,
      environment: [
        piece('basket', 'platform', 6.5, 2.85, 3.6, 0.28, 0, { friction: 0.3 }),
        piece('br', 'wall', 8.45, 3.75, 0.26, 2),
      ],
      starts: [{ id: 'a', x: 2.7, y: 4.4 }],
      goals: [{ id: 'g', x: 6.35, y: 3.85, r: 1.15 }],
      palette: [{ kind: 'bouncer', count: 1, w: 1.5, h: 0.34, props: { power: 13 }, label: 'Bouncer' }],
      medals: { pieces: 1, seconds: 6 },
      hints: [
        'The ring is up and to the right. Dropping straight down will not reach it.',
        'The stripe on the bouncer is the kick.',
        'Rotate the bouncer so the stripe points toward the basket, then put it under the ball.',
        'A kick up and to the right. Think of it as a spring with a face.',
        'Place the bouncer under the ball, tilted so its stripe aims up-right into the basket.',
      ],
    }),
    makeLevel({
      id: 'w2-chain',
      name: 'Two Springs',
      worldId: 'springs',
      summary: 'One throw reaches the first shelf. The second throw finishes it.',
      intent: 'Chain two vertical springs and two one-way shelves.',
      view: { x: 0.2, y: -0.5, w: 8.6, h: 11.2 },
      environment: [
        chainFloor,
        piece('left', 'wall', 2.65, 4.3, 0.28, 8),
        piece('right', 'wall', 5.35, 4.3, 0.28, 8),
        piece('mid', 'oneway', 4, 3.7, 1.9, 0.18),
        piece('top', 'oneway', 4, 6.55, 1.9, 0.18),
      ],
      starts: [{ id: 'a', ...chainBall }],
      goals: [{ id: 'g', x: 4, y: 7.15, r: 0.55 }],
      palette: [{ kind: 'spring', count: 2, w: 1.05, h: 0.46, rot: deg(90), props: { power: 13 }, label: 'Spring' }],
      medals: { pieces: 2, seconds: 8 },
      hints: [
        'There are two chevron shelves. The ring is on the higher one.',
        'Each spring is a single throw. You have two.',
        'Put a spring on the floor, and another on the middle shelf.',
        'The ball passes up through a shelf, lands, and needs a fresh throw.',
        'One spring under the ball. A second spring resting on the middle shelf, arrow up.',
      ],
    }),
    makeLevel({
      id: 'w3-push',
      name: 'Give It a Push',
      worldId: 'momentum',
      summary: 'The ball cannot jump the gap alone.',
      intent: 'Accelerator supplies the speed a short slope cannot.',
      trajectory: 'partial',
      previewSeconds: 1.15,
      view,
      environment: [
        pushLip,
        piece('run', 'platform', 4.55, 3.72, 3.3, 0.24, 0, { friction: 0.05 }),
        piece('land', 'platform', 9.15, 3.55, 3.6, 0.24, 0, { friction: 0.35 }),
        piece('stop', 'wall', 11.05, 4.4, 0.26, 1.9),
      ],
      starts: [{ id: 'a', ...pushBall }],
      goals: [{ id: 'g', x: 9.9, y: 4.2, r: 0.8 }],
      palette: [{ kind: 'accelerator', count: 1, w: 2.2, h: 1.2, props: { power: 32, max: 11 }, label: 'Accelerator' }],
      medals: { pieces: 1, seconds: 7 },
      hints: [
        'The ring is on the far ledge. The gap is the problem.',
        'An accelerator adds speed along its arrows.',
        'Lay it on the runway, arrows pointing at the gap.',
        'The ball needs the boost before it leaves the ledge, not after.',
        'Place the accelerator on the flat run, pointing right.',
      ],
    }),
    makeLevel({
      id: 'w3-uphill',
      name: 'Uphill',
      worldId: 'momentum',
      summary: 'The slope is the wrong way. The belt does not care.',
      intent: 'Conveyor carries the ball up a slope it could never climb.',
      trajectory: 'partial',
      previewSeconds: 1.2,
      view,
      environment: [piece('cap', 'platform', 7.6, 3.25, 2.2, 0.24, 0, { friction: 0.45 })],
      starts: [{ id: 'a', x: 2.15, y: 2.35 }],
      goals: [{ id: 'g', x: 5.85, y: 3.8, r: 0.7 }],
      palette: [{ kind: 'conveyor', count: 1, w: 6.2, h: 0.28, props: { power: 5.2 }, label: 'Conveyor' }],
      medals: { pieces: 1, seconds: 8 },
      hints: [
        'The ring is on the high ledge. The ball will not roll uphill by itself.',
        'A conveyor drags the ball along the belt.',
        'Rotate the belt so its marks run up the slope, then bridge the two ledges.',
        'The belt has to meet the ball. A beautiful belt in the wrong place does nothing.',
        'One conveyor from the low pad up to the high ledge, belt running uphill.',
      ],
    }),
    makeLevel({
      id: 'w3-ferry',
      name: 'The Ferry',
      worldId: 'momentum',
      summary: 'The platform moves. The ring waits at one end of its route.',
      intent: 'Drop the ball onto a slow, wide mover. Timing is forgiving.',
      trajectory: 'partial',
      previewSeconds: 1.3,
      view,
      environment: [
        ferryLip,
        piece('ferry', 'mover', 9.2, 3.15, 3.6, 0.28, 0, { distance: 2.4, period: 5.5, friction: 0.55 }),
      ],
      starts: [{ id: 'a', ...ferryBall }],
      goals: [{ id: 'g', x: 10.3, y: 3.75, r: 0.72 }],
      palette: [{ kind: 'ramp', count: 1, w: 4.2, h: 0.22, label: 'Ramp' }],
      medals: { pieces: 1, seconds: 9 },
      hints: [
        'The ring hangs at the right end of the ferry’s route.',
        'Get the ball onto the ferry. It will do the carrying.',
        'A ramp from the ledge down onto the ferry’s path.',
        'If you miss the ferry, launch again. It keeps its rhythm.',
        'Slope a ramp from the start ledge down toward the middle of the ferry.',
      ],
    }),
    makeLevel({
      id: 'w4-side',
      name: 'Sideways',
      worldId: 'gravity',
      summary: 'Inside the field, down is to the right.',
      intent: 'Player places a sideways gravity zone aligned with a tunnel.',
      trajectory: 'partial',
      previewSeconds: 1.2,
      view,
      environment: [
        sideLip,
        piece('shaftL', 'wall', 4.35, 3.6, 0.28, 5.6),
        piece('shaftRlow', 'wall', 6.75, 1.7, 0.28, 2.4),
        piece('shaftRhigh', 'wall', 6.75, 7.15, 0.28, 2.3),
        piece('tunnel', 'platform', 10.1, 3.55, 4.6, 0.28, 0, { friction: 0.22 }),
        piece('tend', 'wall', 12.5, 4.5, 0.26, 2.1),
      ],
      starts: [{ id: 'a', ...sideBall }],
      goals: [{ id: 'g', x: 10.8, y: 4.25, r: 0.9 }],
      palette: [{ kind: 'gravity', count: 1, w: 2.5, h: 3.4, props: { power: 28 }, label: 'Side field' }],
      medals: { pieces: 1, seconds: 8 },
      hints: [
        'The ring is in the side tunnel. Falling down the shaft misses it.',
        'A gravity field replaces down. Its arrow is the new down.',
        'Put the field in the shaft, level with the tunnel, arrow pointing into it.',
        'If the field sits too low, the ball is already past the tunnel.',
        'Place the side field in the shaft so its arrow points right, into the tunnel.',
      ],
    }),
    makeLevel({
      id: 'w4-lift',
      name: 'The Lift',
      worldId: 'gravity',
      summary: 'This field falls upward.',
      intent: 'Upward gravity carries the ball through a one-way shelf.',
      trajectory: 'partial',
      previewSeconds: 1.2,
      view: { x: 0.2, y: -0.4, w: 8.4, h: 10.6 },
      environment: [
        liftFloor,
        piece('left', 'wall', 1.9, 4, 0.28, 6.6),
        piece('right', 'wall', 4.5, 4, 0.28, 6.6),
        piece('shelf', 'oneway', 3.2, 5.35, 1.85, 0.18),
      ],
      starts: [{ id: 'a', ...liftBall }],
      goals: [{ id: 'g', x: 3.2, y: 5.95, r: 0.55 }],
      palette: [{ kind: 'gravity', count: 1, w: 2.3, h: 3.2, rot: deg(90), props: { power: 20 }, label: 'Lift field' }],
      medals: { pieces: 1, seconds: 7 },
      hints: [
        'The ring is on the chevron shelf. Nothing is pushing the ball yet.',
        'The lift field’s arrow points up. Inside it, the ball falls toward that arrow.',
        'Cover the ball with the field.',
        'The shelf lets the ball through from below, then catches it.',
        'Place the lift field over the ball so the arrow points up the shaft.',
      ],
    }),
    makeLevel({
      id: 'w4-choice',
      name: 'The Wrong Tunnel',
      worldId: 'gravity',
      summary: 'Both tunnels will take a field. Only one holds the ring.',
      intent: 'Choose the height of a sideways field. The lower tunnel is empty.',
      trajectory: 'partial',
      previewSeconds: 1.05,
      view,
      environment: [
        choiceLip,
        piece('shaftL', 'wall', 4.4, 3.7, 0.28, 5.8),
        piece('lowWall', 'wall', 6.85, 1.8, 0.28, 2.6),
        piece('midWall', 'wall', 6.85, 4.35, 0.28, 1.5),
        piece('highWall', 'wall', 6.85, 7.7, 0.28, 1.8),
        piece('low', 'platform', 10.2, 2.15, 3.8, 0.26, 0, { friction: 0.15 }),
        piece('high', 'platform', 10.6, 4.35, 4.4, 0.28, 0, { friction: 0.25 }),
        piece('hend', 'wall', 12.95, 5.3, 0.26, 2.1),
      ],
      starts: [{ id: 'a', ...choiceBall }],
      goals: [{ id: 'g', x: 10.4, y: 5.15, r: 1.15 }],
      palette: [{ kind: 'gravity', count: 1, w: 2.45, h: 2.3, props: { power: 26 }, label: 'Side field' }],
      medals: { pieces: 1, seconds: 8 },
      hints: [
        'The ring is in the upper tunnel. The lower tunnel is a decoy.',
        'You have one field. Its height is the decision.',
        'Line the field up with the upper opening.',
        'Use the short path preview. If the dots dive into the lower tunnel, move the field.',
        'Place the field high in the shaft, arrow pointing into the upper tunnel.',
      ],
    }),
    makeLevel({
      id: 'w5-shortcut',
      name: 'The Shortcut',
      worldId: 'gates',
      summary: 'The pit is a door, if you enter it on purpose.',
      intent: 'Environment portal pair. Player ramp feeds the entrance. Exit aims at the goal.',
      trajectory: 'off',
      previewSeconds: 0,
      view,
      environment: [
        shortLip,
        piece('in', 'portal', 6.4, 3.15, 0.46, 1.7, deg(-90), { link: 'pit' }),
        piece('out', 'portal', 11.2, 5.4, 0.46, 1.7, 0, { link: 'pit' }),
        piece('deck', 'platform', 14, 5.15, 3.2, 0.28, 0, { friction: 0.4 }),
        piece('end', 'wall', 15.7, 6.05, 0.26, 2),
      ],
      starts: [{ id: 'a', ...shortBall }],
      goals: [{ id: 'g', x: 14.2, y: 5.85, r: 0.8 }],
      palette: [{ kind: 'ramp', count: 1, w: 3.6, h: 0.22, label: 'Ramp' }],
      medals: { pieces: 1, seconds: 7 },
      hints: [
        'The striped gate and the dotted gate are a pair.',
        'Entering one sends the ball out of the other, turned to face the exit.',
        'Feed the ball into the lower gate with a ramp.',
        'The exit already points along the deck. You do not need to move it.',
        'A ramp from the ledge into the lower portal.',
      ],
    }),
    makeLevel({
      id: 'w5-spring',
      name: 'Spring to Somewhere',
      worldId: 'gates',
      summary: 'Throw the ball into a gate you cannot reach on foot.',
      intent: 'Combine a spring with an environment portal above the ball.',
      trajectory: 'off',
      previewSeconds: 0,
      view,
      environment: [
        portSpringFloor,
        piece('in', 'portal', 2.6, 5.55, 0.46, 1.55, deg(90), { link: 'sky' }),
        piece('out', 'portal', 10.4, 5.5, 0.46, 1.55, 0, { link: 'sky' }),
        piece('deck', 'platform', 13.1, 5.15, 3.4, 0.28, 0, { friction: 0.12 }),
        piece('end', 'wall', 14.95, 6.05, 0.26, 2),
      ],
      starts: [{ id: 'a', ...portSpringBall }],
      goals: [{ id: 'g', x: 14.1, y: 5.85, r: 0.8 }],
      palette: [{ kind: 'spring', count: 1, w: 1.15, h: 0.48, rot: deg(90), props: { power: 14 }, label: 'Spring' }],
      medals: { pieces: 1, seconds: 6 },
      hints: [
        'The entrance hovers above the ball. The exit faces the deck.',
        'A spring can reach a gate a ramp cannot.',
        'Point the spring up, under the ball, into the gate.',
        'If the throw is too weak, the ball peaks below the gate. This spring is strong enough when it points straight up.',
        'Place the spring under the ball with the arrow pointing up into the portal.',
      ],
    }),
    makeLevel({
      id: 'w5-pair',
      name: 'A Doorway',
      worldId: 'gates',
      summary: 'This time the pair is yours. Place both ends.',
      intent: 'Player places a portal pair to cross a wall.',
      trajectory: 'off',
      previewSeconds: 0,
      view,
      environment: [
        pairLip,
        piece('wall', 'wall', 8.4, 4.2, 0.3, 6.5),
        piece('deck', 'platform', 12.6, 3.4, 3.4, 0.28, 0, { friction: 0.35 }),
        piece('end', 'wall', 14.45, 4.35, 0.26, 2.1),
      ],
      starts: [{ id: 'a', ...pairBall }],
      goals: [{ id: 'g', x: 13, y: 4.15, r: 0.8 }],
      palette: [{ kind: 'portal', count: 1, w: 0.46, h: 1.6, label: 'Portal pair' }],
      medals: { pieces: 2, seconds: 8 },
      hints: [
        'The wall blocks the deck. A portal pair is one tool with two ends.',
        'The first placement is the entrance. The second is the exit.',
        'Put the entrance where the ball is already going, and the exit on the deck, pointing along it.',
        'Match the exit’s arrow to the way you want the ball to leave.',
        'Entrance in the ball’s path on the left of the wall. Exit on the deck, arrow pointing right.',
      ],
    }),
    makeLevel({
      id: 'w6-cannon',
      name: 'The Cannon',
      worldId: 'machines',
      summary: 'Feed the barrel. It fires along its mouth.',
      intent: 'Ball rolls into a placed cannon aimed at a high basket.',
      trajectory: 'off',
      previewSeconds: 0,
      view,
      environment: [
        cannonLip,
        piece('basket', 'platform', 12.4, 5.5, 3.8, 0.28, 0, { friction: 0.25 }),
        piece('br', 'wall', 14.45, 6.5, 0.26, 2.2),
      ],
      starts: [{ id: 'a', ...cannonBall }],
      goals: [{ id: 'g', x: 11.7, y: 6.85, r: 1.2 }],
      palette: [{ kind: 'cannon', count: 1, w: 1.3, h: 0.64, rot: deg(55), props: { power: 14 }, label: 'Cannon' }],
      medals: { pieces: 1, seconds: 7 },
      hints: [
        'The basket is high and to the right. The cannon fires along its barrel.',
        'The ball has to enter the cannon. Place the mouth in its path.',
        'Rotate the barrel toward the basket before you worry about small shifts.',
        'A steep barrel wastes the throw into the ceiling of the basket. A flat one never rises.',
        'Set the cannon at the end of the ledge, barrel aimed up-right into the basket.',
      ],
    }),
    makeLevel({
      id: 'w6-latch',
      name: 'The Latch',
      worldId: 'machines',
      summary: 'The door opens for a ball that has already passed the switch.',
      intent: 'Route over a switch, then a spring throws the ball through the opened door.',
      trajectory: 'off',
      previewSeconds: 0,
      view,
      environment: [
        latchPad,
        piece('sw', 'switch', 5.4, 5.55, 1.15, 1),
        piece('pit', 'platform', 9.2, 1.15, 2.4, 0.28),
        piece('spring', 'spring', 9.2, 1.85, 1.1, 0.48, deg(90), { power: 15 }),
        piece('door', 'door', 9.2, 4.15, 0.3, 1.7, 0, { gate: 'sw' }),
        piece('shelf', 'oneway', 9.2, 5.85, 2, 0.18),
        piece('guide2', 'wall', 10.7, 3.5, 0.24, 4.2),
      ],
      starts: [{ id: 'a', ...latchBall }],
      goals: [{ id: 'g', x: 9.2, y: 6.45, r: 0.55 }],
      palette: [{ kind: 'ramp', count: 2, w: 3.4, h: 0.22, label: 'Ramp' }],
      medals: { pieces: 2, seconds: 9 },
      hints: [
        'The door stays shut until the switch feels the ball.',
        'The spring in the pit fires upward. The door is in that path.',
        'Cross the switch on the way into the pit. Order matters.',
        'You may need one ramp to the switch and another down into the pit.',
        'Ramp from the pad across the switch, then down into the pit. The spring does the rest.',
      ],
    }),
    makeLevel({
      id: 'w6-both',
      name: 'Both Rings',
      worldId: 'machines',
      summary: 'Two balls. Two rings. Each throw belongs to one of them.',
      intent: 'Two independent shafts. First multi-ball lesson, using a mechanic the player already trusts.',
      trajectory: 'partial',
      previewSeconds: 1.2,
      view: { x: 0.2, y: -0.6, w: 14.6, h: 10.6 },
      environment: [
        piece('floorA', 'platform', 3.6, 0.85, 2.2, 0.28),
        piece('leftA', 'wall', 2.3, 3.6, 0.28, 6.4),
        piece('rightA', 'wall', 4.9, 3.6, 0.28, 6.4),
        piece('shelfA', 'oneway', 3.6, 4.55, 1.85, 0.18),
        piece('floorB', 'platform', 9.4, 0.85, 2.2, 0.28),
        piece('leftB', 'wall', 8.1, 3.6, 0.28, 6.4),
        piece('rightB', 'wall', 10.7, 3.6, 0.28, 6.4),
        piece('shelfB', 'oneway', 9.4, 4.55, 1.85, 0.18),
      ],
      starts: [
        { id: 'a', x: 3.6, y: 1.36 },
        { id: 'b', x: 9.4, y: 1.36 },
      ],
      goals: [
        { id: 'ga', x: 3.6, y: 5.15, r: 0.58, ballId: 'a' },
        { id: 'gb', x: 9.4, y: 5.15, r: 0.58, ballId: 'b' },
      ],
      palette: [{ kind: 'spring', count: 2, w: 1.1, h: 0.48, rot: deg(90), props: { power: 14 }, label: 'Spring' }],
      medals: { pieces: 2, seconds: 7 },
      hints: [
        'Each ring belongs to one ball. A spring under the left ball does not help the right.',
        'You have two springs. One shaft each.',
        'Point both arrows up, and put each spring under its ball.',
        'The chevron shelves catch a ball coming from below.',
        'A spring on each floor, arrow up, directly under each ball.',
      ],
    }),
    makeLevel({
      id: 'w7-break',
      name: 'Let It Break',
      worldId: 'fragile',
      summary: 'The cracked plank is the door. Hit it hard enough.',
      intent: 'A drop onto a low-threshold breakable reveals the goal underneath.',
      trajectory: 'partial',
      previewSeconds: 1.2,
      view,
      environment: [
        breakLip,
        piece('glass', 'breakable', 9.1, 4.05, 3.2, 0.7, 0, { threshold: 2.4 }),
      ],
      starts: [{ id: 'a', ...breakBall }],
      goals: [{ id: 'g', x: 10, y: 2.2, r: 1.55 }],
      palette: [{ kind: 'ramp', count: 1, w: 5.5, h: 0.22, label: 'Ramp' }],
      medals: { pieces: 1, seconds: 7 },
      hints: [
        'The ring is underneath the cracked plank.',
        'A cracked plank gives way when the hit is hard enough.',
        'Send the ball onto it from above, not as a gentle roll from the side.',
        'A ramp that ends over the plank lets the ball drop onto it.',
        'Slope a ramp from the ledge so the ball drops onto the cracked plank.',
      ],
    }),
    makeLevel({
      id: 'w7-hard',
      name: 'Hard Enough',
      worldId: 'fragile',
      summary: 'A gentle drop will not do. The plank wants a real impact.',
      intent: 'Higher break threshold. Accelerator or a steep ramp supplies the hit.',
      trajectory: 'off',
      previewSeconds: 0,
      view,
      environment: [
        hardLip,
        piece('glass', 'breakable', 11.2, 4.6, 2.4, 0.34, 0, { threshold: 6 }),
      ],
      starts: [{ id: 'a', ...hardBall }],
      goals: [{ id: 'g', x: 11.2, y: 2.5, r: 1.3 }],
      palette: [
        { kind: 'ramp', count: 1, w: 4.5, h: 0.22, label: 'Ramp' },
        { kind: 'accelerator', count: 1, w: 2, h: 1.1, props: { power: 36, max: 14 }, label: 'Accelerator' },
      ],
      medals: { pieces: 2, seconds: 8 },
      hints: [
        'The cracked plank is tougher than the last one. A soft landing stays a landing.',
        'Speed at the moment of impact is what breaks it.',
        'An accelerator on the way, then a drop onto the plank.',
        'If the ball rolls across the plank and lives, it was not moving fast enough downward.',
        'Boost the ball along a ramp, then let it fall onto the plank from above.',
      ],
    }),
  ];
}

export const LEVELS: Level[] = levels();

export function linearLevels(): Level[] {
  return LEVELS.filter((level) => !level.secret);
}

export function levelById(id: string): Level | undefined {
  return LEVELS.find((level) => level.id === id);
}

export function worldOf(worldId: string): WorldDef | undefined {
  return WORLDS.find((world) => world.id === worldId);
}

export function levelsInWorld(worldId: string): Level[] {
  return LEVELS.filter((level) => level.worldId === worldId);
}
