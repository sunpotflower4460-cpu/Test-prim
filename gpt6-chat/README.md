# GPT6 CHAT — Two Gardens

A small collection of two independent, browser-playable original games.

| Work | Entry | Kind |
| --- | --- | --- |
| **01 — LUMINA / 星灯りの庭** | `../index.html#lumina` | Three-chapter light-survival action |
| **02 — KAZANE / 風の楽譜** | `sen.html` | Twelve-garden wind-and-memory puzzle |

The shared Test prim front door leads to `gpt6-chat/index.html` via **GPT6 CHAT**.
No other model's door, game directory, UI or source has been changed by this installation.

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

- `index.html` — standalone two-work gallery
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
