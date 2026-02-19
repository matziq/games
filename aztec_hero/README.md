# Aztec Hero (prototype)

A browser-first 2D side-scrolling prototype inspired by classic 8-bit platformers: underground ruins, traps, rising water, and loot.

This is a small vertical-slice scaffold using **Phaser 3 + TypeScript + Vite** so you can iterate quickly and share with a link.

## What’s in the prototype

- Side-scrolling room with platforms (tile placeholders)
- Player movement + jump
- Camera follow
- Spike hazards (simple knockback)
- Rising water + oxygen (drowning restarts the scene)
- Bone piles you can loot with **E** (placeholder treasure counter)

## Controls

- Move: **A/D** or **Left/Right**
- Jump: **Space**
- Interact: **E** (loot bone piles)

## Run it locally

From the `aztec_hero` folder:

```pwsh
npm install
npm run dev
```

Vite is configured to use port **8010**.

## Next steps (easy upgrades)

- Replace runtime-generated placeholder sprites with your pixel art
- Convert platforms to a proper tilemap
- Add enemies (spiders/scorpions) with simple patrol AI
- Add traps: fire jets, dart shooters, collapsing floors
- Add an inventory/weapon system
