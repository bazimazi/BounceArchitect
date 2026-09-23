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

## What’s here

Seven worlds, from the first ramp through springs, momentum, gravity, portals, machines, and breakable floors. Medals are Reach, Lean, and Swift. Hints are optional. A secret level opens when The Narrow Ring earns all three.

The workshop uses the same simulation as the campaign. It unlocks pieces as the campaign opens them, saves drafts on this device, and can export a level file.

Later worlds, a shared workshop, and daily variety can grow on this same level format. The campaign is data. A new mechanic is a new object kind, not a new game.
