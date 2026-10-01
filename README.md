# Bounce Architect

A physics puzzle game where you don't control the ball. You engineer the world around it.

Place a ramp, a spring, a field, or a gate. Launch. Watch the ball. Read why it failed. Change one thing and launch again. Failure is free.

## Play

```bash
npm install
npm run dev
```

Then open the local address Vite prints. `npm test` checks the physics and that every campaign level has a buildable solution. `npm run build` typechecks and bundles the game.

Progress, drafts, and settings stay in this browser. Nothing is sent anywhere.

## Visual style

An illuminated drafting studio: deep teal instrument panels, brass edges, engraved grids, and a different light color for each world. The title runs a real physics experiment beside the wordmark, and the campaign has animated mechanism illustrations. In play, luminous trails, drifting sparks, surface shockwaves, and reactive goal rings make the ball's motion easier to follow.

The room texture is cached at the display resolution; moving details are drawn procedurally without image downloads. Reduced motion stops decorative loops and impact effects, and high contrast provides a white construction board and stronger outlines. Both are available in Settings.

## What’s here

Seven worlds, from the first ramp through springs, momentum, gravity, portals, machines, and breakable floors. Each world opens with the level that teaches its mechanic. After that, one spare level stays open beyond the next, and the next world opens once all but one level here is cleared, so no single puzzle is a wall. Stuck players are offered hints, then a pass that moves them on without a medal.

Medals are Reach, Lean, and Swift. They raise your rank and open new ball finishes. A secret level opens when The Narrow Ring earns all three. The map keeps a short "within reach" list of the medals your best builds came closest to, and marks a world perfected once every medal in it is earned. Each puzzle shows your best time and piece count, and the result card calls out a new best.

Feats reward how you play rather than how far you get: clearing on the first launch, clearing without hints, coming back to a puzzle you passed on, keeping a daily streak, exporting a workshop level. Some of them open ball finishes of their own. The logbook shows every feat with its progress, along with your rank and record.

The daily blueprint comes from the whole campaign, with a stand-in from opened levels when today's is still ahead. Finishing it on consecutive days builds a streak, and the map remembers your longest one.

The workshop uses the same simulation as the campaign. It unlocks pieces as the campaign opens them, saves drafts on this device, and can export a level file.

Later worlds, a shared workshop, and daily variety can grow on this same level format. The campaign is data. A new mechanic is a new object kind, not a new game.
