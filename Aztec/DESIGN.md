---
name: "Aztec: The jade expedition"
description: "A black-field, limited-color chamber adventure with original pixel artwork."
colors:
  paper: "#eeeee4"
  quiet: "#aaa99e"
  jade: "#76e890"
  stone: "#ec62dc"
  orange: "#ffa64b"
  playfield: "#000"
  page: "#080808"
  control: "#111"
  control-hover: "#242420"
  control-border: "#66665e"
  divider: "#34342f"
  inactive-pixel: "#25251e"
typography:
  display:
    fontFamily: '"Courier New", monospace'
    fontSize: "clamp(42px, 9vw, 88px)"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.09em"
  heading:
    fontFamily: '"Courier New", monospace'
    fontSize: "25px"
    fontWeight: 700
    lineHeight: 1.5
  body:
    fontFamily: '"Courier New", monospace'
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: '"Courier New", monospace'
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.5
rounded:
  square: "0"
components:
  command-button:
    backgroundColor: "{colors.control}"
    textColor: "{colors.paper}"
    rounded: "{rounded.square}"
    padding: "8px 13px"
  command-button-hover:
    backgroundColor: "{colors.control-hover}"
    textColor: "{colors.paper}"
  primary-button:
    backgroundColor: "{colors.jade}"
    textColor: "#060806"
    rounded: "{rounded.square}"
    padding: "8px 24px"
  text-input:
    backgroundColor: "{colors.control}"
    textColor: "{colors.quiet}"
    rounded: "{rounded.square}"
    padding: "6px 9px"
    height: "42px"
---

# Design System: Aztec: The jade expedition

## Overview

**Creative North Star: "A small, dangerous machine"**

Black space, thin magenta chamber edges, diagonal steps, and small limited-color
figures define the world. The surrounding HTML is a quiet command surface, not
a dashboard. Original pixel artwork honors the supplied Apple II visual grammar
without copying its title illustration.

This records the built `index.html` and `game.js`, reviewed against the supplied
desktop, portrait, and landscape captures. Product and adaptation facts remain
in PRODUCT.md and README.md.

**Key Characteristics:**
- Three-tier black chambers with thin magenta structure.
- Original pixel figures and alternating green/white stairs.
- Compact inventory plus readable HTML commands and status.
- Square controls, flat surfaces, and restrained monospaced type.

## Colors

A narrow, high-contrast palette distinguishes structure, figures, supplies, and
commands without introducing decorative color systems.

### Primary
- **Stone magenta:** chamber boundaries, platforms, explored map rooms, title
  rule, and dialog outlines.

### Secondary
- **Jade green:** stairs, strength, idol, entrance, mission, primary buttons,
  movement state, and mobile status.

### Tertiary
- **Supply orange:** equipment, shafts, hazards, messages, and focus outlines.

### Neutral
- **Paper:** figures, important labels, and ordinary control text.
- **Quiet:** secondary labels and instructions.
- **Playfield / page:** black canvas against the near-black page.
- **Control / control-hover / control-border:** flat interactive surfaces.
- **Divider:** subtle HTML boundaries.
- **Inactive pixel:** depleted strength, unvisited map cells, and spent loot.

**The Shared Palette Rule.** Keep the five named HTML colors aligned with the
canvas palette; the two implementations currently use identical values.

## Typography

Courier New with a monospace fallback is the only font stack; nothing downloads.
The display is broad, bold, and letter-spaced. Supporting type remains compact
and functional rather than becoming an ornamental title treatment.

- Display uses the frontmatter ramp; short landscape overrides it to 48px.
- Section headings use the heading role, reduced to 20px on narrow/short layouts.
- Body uses the body role; form labels, toolbar, and keyboard hints use 12px.
- Messages and help details use 13px; footer and touch-button labels use 11px.
- Canvas text is bold, generally 8–9 logical pixels, drawn with the same stack.

**The HTML Readability Rule.** Do not rely on the scaled canvas HUD alone on
mobile; preserve the HTML status, map descriptions, and field guide.

## Layout

The desktop cabinet is centered, at most 1008px wide, with 24px outer margins.
Its order is toolbar, game, message/objective readout, keyboard guide, and footer.
The canvas is 560 × 320 logical pixels, displayed at 7:4 with pixelated scaling.
Inventory remains integrated beneath the three room tiers.

At coarse pointers or widths up to 760px, outer gutters become 12px, keyboard
hints yield to touch controls, and an HTML strength/ammo/dynamite/location line
supports the smaller canvas. Setup becomes an in-flow panel and hides the
preview chamber so its form stays legible.

Up to 420px, the D-pad occupies 140px and action controls take the remaining
width; zero-minimum D-pad tracks prevent label-driven overlap. At heights up to
500px and widths 600–1000px, the game and a 300px control column sit side by side,
with status below; nonessential footer and keyboard hints disappear.

Spacing uses compact 4–14px control gaps and larger 20–24px panel separations.
These are observed component values, not an invented global spacing scale.

## Elevation & Depth

There are no shadows or gradients. Black translucent panels dim the chamber;
dialogs use a dark backdrop and a magenta outline. Borders, contrast, and scene
occlusion establish hierarchy without raised cards.

## Shapes

HTML controls have square corners and thin borders. Canvas geometry uses
integer-rounded rectangles, two-logical-pixel platforms, stepped diagonals,
and deliberately small figures. Preserve the difference between playable
terrain and surrounding HTML controls.

## Components

- **Command buttons:** flat dark surface, paper text, bold type, 44px minimum
  height; hover brightens the border and surface. Disabled text dims.
- **Primary buttons:** jade fill and dark text; hover uses a lighter green.
  Start, resume, and retry share this treatment.
- **Inputs/selects:** square dark fields, 42px height, quiet labels above.
  Setup wraps without replacing native selection controls.
- **Toolbar:** compact text buttons, 36px minimum height on desktop and 44px
  in touch/narrow and short-landscape layouts.
- **Touch controls:** separated D-pad and six-action grid, 48px minimum button
  height, held movement and simultaneous movement/jump support.
- **Status:** orange live message, quiet desktop objective, jade mobile resource
  line. The canvas retains inventory and a small visited-room map.
- **Dialogs/panels:** help and map use native dialogs; pause and result panels
  stay inside the screen. Help becomes one column in the mobile layout.

Visible keyboard focus is an orange 2px outline with 4px offset. Gameplay motion
is functional; reduced motion removes decorative stride, hurt/fuse flicker, and
blast flashes without disabling traversal. There are no CSS transition tokens.

## Do's and Don'ts

### Do:
- **Do** preserve black chambers, thin magenta tiers, and green/white stairs.
- **Do** keep figures small and inventory integrated into the playfield.
- **Do** retain readable HTML help/status and separated touch-control groups.
- **Do** keep original artwork and the shared HTML/canvas palette.

### Don't:
- **Don't** add gradients, dashboard chrome, shadows, or copied title artwork.
- **Don't** replace the command-driven exploration with decorative UI.
- **Don't** enlarge pixel figures into an unrelated illustration style.
- **Don't** treat this adaptation as a pixel-exact remake or fully screen-reader-playable game.
