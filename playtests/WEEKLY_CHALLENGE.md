# Weekly Challenge V0 — ops rotation

**Timezone:** Asia/Shanghai · **Week id:** ISO `YYYY-Www` (Mon–Sun)

## Player path
1. Open landing → **本周挑战 / This week’s challenge**
2. Play → `index.html?bundle=<featured>&weekly=1&week=<week_id>`
3. HUD shows `WEEKLY <week_id> · …` when `weekly=1`

## How rotation works
- `ops_web/weekly.js` computes the current ISO week in Asia/Shanghai in the browser (no server).
- Loads `ops_web/weekly.json` → prefers `weeks[week_id]`, else `presets[week_number % N]`.
- **V0 layout:** uses an existing **signed** bundle (`neon_rooftop_84023` Hardcore Night by default; some weeks feature `84022`). `ops_seed_label` is a shared ops id only — **BundleGate `layout.seed` is not rewritten** (keeps integrity).
- **V1 (optional):** publish signed weekly bundles whose `layout.seed` derives from the week; still verify via BundleGate.

## Operator: hand-edit a week
1. Edit `runtime/godot4_web/ops_web/weekly.json` → `weeks["2026-W45"] = { bundle_id, title, goal, goal_zh, ... }`
2. Redeploy Pages ops overlay (`deploy_neon_pages.sh` or static copy of `weekly.json` + `landing.html` + `weekly.js`).
3. No fake playtest rows — G-FINAL still needs real stranger N≥5.

## Files
- `ops_web/weekly.json` · `ops_web/weekly.js` · landing card `#weekly-challenge`
