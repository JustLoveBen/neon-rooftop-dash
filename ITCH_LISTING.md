# itch.io listing copy — Neon Rooftop Dash

## Publish status (2026-10-27 Asia/Shanghai)
**BLOCKED — not published.** No `butler` binary and no `BUTLER_API_KEY` / itch credentials on Mac mini or box.
Do **not** stall G-FINAL reach on itch: use GH Pages landing + Issue template + SHARE_BLURB instead.
When credentials exist: `butler push` HTML5 build from `runtime/godot4_web/export/web_release` (or embed landing URLs) using the paste copy below.

Paste-ready. **Do not claim “live ops complete” or G-FINAL.** Soft-launch / playtest build.

Updated: 2026-10-27 13:51 Asia/Shanghai

---
## Title
Neon Rooftop Dash

## Short description (≤140 chars recommended)
Neon rooftop speedrun in the browser — WASD dash to the green pad before the clock. Signed levels, no install.

## Long description

**Neon Rooftop Dash** is a short 3D challenge: race across glowing rooftops, jump gaps, and hit the green pad before time runs out.

Built as the first public title on an AI Spec → signed GameSpec → Godot Web pipeline. Play in any modern desktop browser (WebGL). No account, no download.

### Modes
- **Classic** — landing button **Play Classic** (`?bundle=neon_rooftop_84021`): timed rooftop dash to the green goal pad.
- **Checkpoint Run** — **Play Checkpoint Run** (`?bundle=neon_rooftop_84022`): hit yellow neon rings (`cp=N/3`) then the goal.
- **Hardcore Night** — **Play Hardcore Night** (`?bundle=neon_rooftop_84023`): tighter 55s clock, denser obstacles, checkpoints required.
- **Tamper demo** — broken bundle URL shows **BUNDLE REJECTED** (integrity gate).

### Controls
| Input | Action |
|-------|--------|
| **WASD** | Move |
| **Space** | Jump |
| **R** | Restart match |
| Click canvas first | Capture keyboard focus |

### Play (public HTTPS)
| Link | URL |
|------|-----|
| **Landing** | https://justloveben.github.io/neon-rooftop-dash/landing.html |
| Classic (`Play Classic`) | https://justloveben.github.io/neon-rooftop-dash/index.html?bundle=neon_rooftop_84021 |
| Checkpoint (`Play Checkpoint Run`) | https://justloveben.github.io/neon-rooftop-dash/index.html?bundle=neon_rooftop_84022 |
| Hardcore Night (`Play Hardcore Night`) | https://justloveben.github.io/neon-rooftop-dash/index.html?bundle=neon_rooftop_84023 |
| Tamper (expect reject) | https://justloveben.github.io/neon-rooftop-dash/index.html?bundle=tampered |
| Health JSON | https://justloveben.github.io/neon-rooftop-dash/bundles_index.json |

Prefer the **landing** page — buttons **Play Classic** / **Play Checkpoint Run** / **Play Hardcore Night**, device leaderboard export, and playtest notes.

### Tags (itch)
`3D` · `WebGL` · `browser` · `speedrun` · `endless-ish` · `neon` · `parkour` · `short` · `prototype` · `indie` · `hardcore`

Suggested itch category: **Games → Action / Platformer** (browser / HTML5).

### What to feedback (playtests)
After ~3 minutes, reply with:
1. Could you move after clicking the canvas?
2. Win, lose (timeout/fall), or stuck?
3. Checkpoint HUD — did `cp` leave `0/3` when you hit a yellow ring?
4. Hardcore Night — did the tighter clock feel fair? Any soft-lock?
5. Any crash, black screen, or input freeze?
6. Would you play again? Y/N

Full 3-min script + recruit copy live in the project under `playtests/RECRUIT.md` and `playtests/STRANGER_SCRIPT_3MIN.md`.

### Honest status
Public soft-launch on GitHub Pages. Three signed modes live (Classic / Checkpoint / Hardcore Night). Device-local leaderboard / telemetry only (no global ranked service). **Not** claiming full live ops or shipping-complete until external stranger playtests are logged (N≥5). **G-FINAL remains FAIL.**

### Credits / stack
Godot 4 Web · signed GameSpec bundles · BundleGate · Genre Pack `3d_short_challenge.v1`

Repo (Pages host): https://github.com/JustLoveBen/neon-rooftop-dash
