# Echo Shift — Out‑smart Your Past

## Quick Start

1. **Open the project folder**
   ```
   cd "C:/Users/gunda/.gemini/antigravity/scratch/EchoShift"
   ```
2. **Launch a local server** – the easiest way is the VS Code *Live Server* extension:
   - Open the folder in VS Code.
   - Right‑click `index.html` → **Open with Live Server**.
   - The game will open in your default browser at `http://127.0.0.1:5500` (or similar).
3. Press **Play** on the main menu to start Level 1.

> No backend or external assets are required – everything runs in the browser.

## Game Controls

| Key | Action |
|-----|--------|
| **W/A/S/D** or **Arrow keys** | Move the player |
| **R** | Start / stop a recording (creates a ghost) |
| **Space** | Pause / resume the whole game |
| **Reset** button | Restart the current level |
| UI buttons | Navigate menus, select levels, etc |

## Core Mechanics

### 1. Recording & Ghost Replay
- When you press **R**, the engine creates a `recording` object storing timestamps and the player’s position each frame.
- On the second press of **R**, the recording is frozen and a **Ghost** instance is built from a deep‑copy of that data.
- Each ghost replays its movement by interpolating between the recorded positions based on *elapsed time*:
  ```js
  const elapsed = performance.now() - this.startTime;
  // find the two recorded entries surrounding `elapsed`
  // lerp the position → smooth motion independent of frame‑rate
  ```
- The ghost is drawn semi‑transparent magenta and can activate switches just like the player.

### 2. Collision Detection
- All moving entities inherit from a tiny `Entity` base class that implements axis‑aligned‑bounding‑box (AABB) overlap:
  ```js
  collides(other) { … }
  ```
- Doors block the player when closed (`Door.blocks`). Switches simply check `some(actor => this.collides(actor))` each frame.
- Because we use **AABB**, the math is O(1) and perfectly reliable for the rectangular shapes used.

### 3. Switch Logic
- A `Switch` has a boolean `active` flag.
- Every frame it scans the list of *actors* (player + all ghosts) and sets `active = true` if any actor overlaps.
- The visual colour flips from dark gray (`#555`) to bright green (`#0f0`) and a glowing outline appears.

### 4. Door Logic
- Each `Door` stores a list of required `Switch` objects.
- When **all** required switches are active, the door’s `open` flag becomes true and a simple slide‑open animation runs (`openProgress`).
- The door stops blocking collisions once opened.

### 5. Level Progression & Persistence
- Levels are plain JavaScript objects (`createLevel1/2/3`).
- Completed level indices are stored in **LocalStorage** under the key `echoShiftProgress`.
- The level‑selection screen reads this array to show a ✅ check‑mark next to finished levels.

## Code Structure (for Beginners)
```
script.js
│
├─ Utility functions (clamp, Vec2)
├─ Entity base class (pos, size, draw, update, collides)
│   ├─ Player (input, movement, recording hook)
│   ├─ Ghost (replay algorithm)
│   ├─ Switch (activation logic)
│   ├─ Door (open animation, blocking)
│   └─ optional moving obstacle (Level 3)
├─ Level factories (createLevel1/2/3) → return level data
├─ Game loop (requestAnimationFrame → update → render)
├─ UI handling (menus, HUD, button callbacks)
└─ Persistence helpers (LocalStorage save/load)
```
All sections are deliberately kept small and heavily commented so you can trace the flow.

## Three Levels Overview
| Level | Goal | New Mechanic |
|-------|------|--------------|
| **1** | Record a simple walk to a switch → open the door. | Introduction to recording / ghost creation. |
| **2** | Activate *two* switches *simultaneously* – one by you, one by the ghost you just recorded. | Cooperation with a single ghost. |
| **3** | Use *multiple* ghosts, avoid a moving laser‑like obstacle, and time the door opening. | Stacking ghosts, moving obstacle, and timing. |

All levels are solvable without any hidden tricks; the UI shows a short tooltip the first time a new mechanic appears.

## Two‑Minute Hackathon Demo Script
1. **0:00 – 0:10** – Open the page, click **Play**. Show the neon‑styled menu.
2. **0:10 – 0:30** – Level 1: Walk to the switch, press **R** to start recording, move onto the switch, press **R** again. Ghost appears, door opens, walk through to finish.
3. **0:30 – 0:50** – Level 2: Explain that two switches must be pressed together. Record a path that activates the left switch, stop. Demonstrate that the door stays closed. Record a second path that activates the right switch, stop. Show both ghosts standing on switches, door opens, exit.
4. **0:50 – 1:20** – Level 3: Highlight the moving obstacle (yellow bar). Record three short recordings: one to hold the first switch, one for the second, and one to time‑dodge the obstacle. Show ghosts cooperating, door sliding open, player dash through the exit.
5. **1:20 – 1:40** – Press **Reset** to show the level can be restarted instantly without losing ghosts.
6. **1:40 – 2:00** – Finish the level, display the *victory* screen, and point at the **Level Select** screen where completed levels are ticked.

Feel free to adjust the pacing – the core loop runs at 60 fps, so the demo feels smooth on any modern browser.

---

### License & Credits
- All code is **MIT‑licensed** – feel free to fork or modify.
- Visual style uses only CSS colours and HTML‑Canvas primitives – no external images or paid assets.

Enjoy playing and experimenting with time‑travel puzzles!
