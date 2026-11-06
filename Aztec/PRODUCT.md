# Aztec browser adaptation

<!-- impeccable:product-schema 1 -->

## Platform

web

## Product Purpose

An original, playable interpretation of the 1982 Apple II adventure: explore a
random tomb, search its contents, recover a jade idol, and return to the entrance.
This is not a ROM emulator or a pixel-exact reproduction.

## Users and Operating Context

The requested experience is an old-school, keyboard-first browser game that also
works with touch controls and directly from a local HTML file.

## Capabilities and Constraints

- Keep this game independent of Aztec Hero and Treasure of the Aztecs.
- Use original code and artwork; reference images are research input, not assets.
- Preserve deliberate command movement, exploration, stairs, inventory, combat,
  destructive dynamite, and a complete escape objective.
- Use a seeded connected 8-by-8 tomb, difficulty 1 through 8, persistent rooms,
  and a timer-based reward.
- Provide modern controls alongside classic-inspired commands.
- Assumption: a new expedition starts over after death; there is no disk save.

## Brand Commitments

The supplied Apple II screenshots pin the visual grammar: black space, thin
magenta platforms, small limited-color figures, diagonal stairs, and a compact
integrated inventory. Do not copy the illustrated title screen.

## Evidence on Hand

Six user-supplied reference images in `sample_images`, Wikipedia's Aztec article,
MobyGames' indexed description and screenshots, and the original Datamost manual.
Sources and deliberate adaptation differences are recorded in README.md.

## Accessibility

Keyboard and touch operation, visible focus, readable HTML help and status,
pause on focus loss, optional audio, and reduced-motion support. The spatial
canvas game is not a fully screen-reader-playable experience.
