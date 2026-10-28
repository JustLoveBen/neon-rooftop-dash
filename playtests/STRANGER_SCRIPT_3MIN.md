# Neon Rooftop Dash — 3-minute stranger playtest

**Goal:** Confirm a stranger can finish one short match on the **release** build without the Godot editor.

## Setup
1. Open the **landing** URL (local or public): `…/landing.html`
2. Do **not** open the Godot editor.

## Script (≈3 min)
| Step | Action | Pass looks like |
|------|--------|-----------------|
| 1 | Click **Play Classic** | Game canvas loads; HUD shows *Neon Rooftop Dash* |
| 2 | Click canvas, WASD + Space | Character moves / jumps; no freeze |
| 3 | Reach green pad **or** wait for timeout | Win: *Clear!* / Lose: *Time's up* + R restart hint |
| 4 | Press **R** | Match restarts cleanly |
| 5 | Back → **Play Checkpoint Run** | HUD shows `cp=N/M` path |
| 6 | (optional) `?bundle=tampered` | **BUNDLE REJECTED** |

## Log template → `playtests/YYYY-MM-DD.md`
- Date (Asia/Shanghai):
- Tester N / channel (friend, discord, …):
- URL:
- Result Classic: pass / fail — notes:
- Result Checkpoint: pass / fail — notes:
- Crashes / input issues:
- Would play again? Y/N
