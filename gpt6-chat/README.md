# GPT6 CHAT — Three Worlds

Three independent, browser-playable original games made by GPT6 CHAT.

| Work | Entry | Kind |
| --- | --- | --- |
| **01 — LUMINA / 星灯りの庭** | `../index.html#lumina` | Three-chapter light-survival action |
| **02 — KAZANE / 風の楽譜** | `sen.html` | Twelve-garden wind-and-memory puzzle |
| **03 — SETSUNA / 刹那の剣** | `setsuna.html` | Six-gate precision sword action (12 encounters) |

The shared Test prim front door leads to `gpt6-chat/index.html` via **GPT6 CHAT**.
No other model's door, game directory, UI or source has been changed by this installation.


## SETSUNA — an art of the last second

**「ひと呼吸の静寂。その一瞬が、勝負を変える。」**

SETSUNA deliberately moves away from LUMINA's automatic fire and KAZANE's
relaxed puzzle flow. It is a **manual, timing-first sword action game**:

- **Attack** — three-hit sword combinations; the third strike is stronger
- **Parry** — a short active guard window, with perfect-parry counter damage,
  enemy stun, brief time dilation and resonance energy
- **Dash** — directional short-range escape with a temporary invulnerable window
- **Finish** — a wide-area release when the resonance meter reaches 100
- **Six gates, two encounters per gate** — new enemy archetypes are introduced
  across the journey, culminating in a guardian with a reinforcement phase
- **Five between-gate blessings** — choose from nine relic types to shape your
  sword, guard, vitality, timing, speed and finishing power
- **Fail-and-retry** — replay the current gate with restored vitality and
  earned blessings intact; restarting an entire campaign is optional
- **Records** — best gate, clears, kills and best sword chain in localStorage

### SETSUNA controls

| Action | Keyboard | Touch |
| --- | --- | --- |
| Move | WASD / arrow keys | Left thumb-stick, or drag lower-left play field |
| Attack | J | 斬 (hold for successive strokes) |
| Parry | K | 受 |
| Dash | L / Shift | 避 |
| Finish | Space | 閃 |
| Pause | P / Escape | Ⅱ button |
| Help | ? button | ? button |

The game uses a standalone 480×720 logical canvas. The 4 combat buttons
are intentionally independent of the joystick for two-thumb control.
All sound is synthesized locally with Web Audio; no audio assets, external
API, or server is required.

## KAZANE — design intention

**「風を描くたび、森がひとつ音を思い出す。」**

Not every game has to be a battle. The player draws gestures to move a living seed using a
continuous, inertial wind simulation. Each garden contains a few notes of memory: the seed
must collect those notes before the flower wakes up. A three-act arc moves from a morning
forest, through evening light, to a star-filled night.

Every level has been authored rather than procedurally churned out. The 12 levels introduce
stone obstacles, wind eddies and drifting spirits. Wind energy comes back automatically;
there are **no lives, fail timers, paywalls or external APIs**. Success has optional grades,
but the story never punishes slow exploration.

## Controls

- **Phone / tablet:** drag a finger near the seed in the direction you want the wind to blow.
- **Mouse / trackpad:** hold the pointer and trace a wind stroke near the seed.
- **Keyboard:** arrow keys or WASD send continuous wind. Release a direction to let the seed coast.
- **Undo:** return the seed and collected notes to the previous input (keyboard `Z` or button).
- **Restart:** restore the current garden.
- **Hint:** reveal the direction to the next note or flower (keyboard `H`).
- **Pause:** pause wind physics and music progression (Escape or button).
- **Garden atlas:** revisit unlocked stages, attempt better star ratings.
- Sound and reduced-motion controls are in the upper-right corner.

Progress and settings save only to browser `localStorage` under `kazane-wind-v1`.
No personal data is transmitted.

## Implementation

- `index.html` — standalone three-work gallery
- `sen.html` — KAZANE shell and accessible DOM
- `sen.css` — responsive visual design, mobile-first playing order
- `sen.js` — handwritten levels, canvas illustration, sound synthesis, simulation and saves

It is static HTML/CSS/JS and needs no build step, network API or runtime package.
The Google Fonts import is optional, with system/Georgia fallbacks.

The game runs in a logical 480×700 coordinate space; pointer coordinates are converted
using the rendered canvas bounds, so the same levels and hit targets work in landscape
and portrait orientations.

## Quality checks

Source-level smoke checks were carried out against the repository code with a simulated
DOM and canvas, including:

- browser-style launch and first-stage pointer drag
- **undo restoring seed position, wind stroke count, and notes**
- complete notes → flower → unlock/grade/save flow for **all twelve stages**
- atlas, pause/resume, and final narrative ending
- all 12 level routes reach their goals around fixed obstacles on a grid path check

Physical iOS/Android screenshots and audio-output listening are recommended before
treating the visual/audio design as fully device-certified.


## Repeatable regression checks (2026-10-13)

From the repository root, run:

```sh
node gpt6-chat/audit-smoke.js
```

This dependency-free script currently checks 12 cases, including both titles'
JavaScript syntax, the gallery/navigation, LUMINA's enemy loop,
combo experience under the luck upgrade, guardian experience carryover, swept
projectile collision, KAZANE's keyboard/touch-adjacent input/undo, defensive
saved-game parsing and the complete 12-garden unlock/ending path.

A separate physical movement simulation also steered the seed using the
game's keyboard-force physics and found valid routes for **all 12** gardens,
including moving hazards. It is a computational test, not a substitute for
testing real browser pointer events, canvas appearance, audio latency and
battery consumption on actual phones.

Bug fixes from this audit are recorded in `AUDIT.md`.


## Third-work QA (2026-10-13)

Run the complete cross-game suite from the repository root:

```sh
node gpt6-chat/audit-smoke.js
```

This combines the previous LUMINA + KAZANE checks with the new
`node gpt6-chat/setsuna-audit.js` checks (**28 total**). The third
game suite exercises opening enemies, sword contact and hitboxes,
perfect parry, dash invulnerability, projectile defense, finishing
meter, two encounter waves per gate, guardian reinforcement,
relic selection, defeat/retry, pause/help, touch release, corrupt
saves, six-gate completion and continuous input-driven combat.

The continuous input-driven mock successfully reached the sixth
gate's clear state in repeated deterministic trials. These are
simulation tests; real iPhone/Android audio, feel, frame pacing,
and touch-device layout still require hands-on verification.
