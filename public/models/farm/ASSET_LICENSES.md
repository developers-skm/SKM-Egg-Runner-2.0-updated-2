# Farm Environment GLB Asset Licenses

This file documents every GLB model in `public/models/farm/` used to decorate the
Egg Runner 3D game world. All assets here are decorative-only (barns, coops, silos,
hay bales, fences) and never participate in gameplay collision, scoring, or spawning.

Only CC0 / public domain / explicitly commercial-use-free assets are permitted in
this folder. Do not add a file here without completing its entry below.

| Field | Requirement |
|---|---|
| Local filename | exact name in this folder |
| Asset title | original name from source site |
| Creator | original author/handle |
| Source page | URL |
| License | e.g. CC0 1.0 |
| Commercial use | Yes/No |
| Attribution required | Yes/No |
| Original file size | as downloaded |
| Final file size | after optimization (if any) |
| Modifications | e.g. "none" or "re-exported/compressed" |
| Date accessed | YYYY-MM-DD |

---

## silo.glb
- Asset title: Silo House
- Creator: Quaternius
- Source page: poly.pizza (Quaternius farm buildings collection) — exact model page URL not recorded at download time; re-verify at poly.pizza/u/Quaternius before deployment if strict provenance is required
- License: CC0 1.0 (Quaternius releases all packs as CC0; Poly Pizza republishes under the same terms)
- Commercial use: Yes
- Attribution required: No
- Original file size: 128,248 bytes (~125 KB)
- Final file size: 128,248 bytes (unmodified)
- Modifications: none
- Date accessed: 2026-07-31

## windmill.glb
- Asset title: Tower Windmill
- Creator: Quaternius
- Source page: poly.pizza (Quaternius farm buildings collection) — exact model page URL not recorded at download time; re-verify at poly.pizza/u/Quaternius before deployment if strict provenance is required
- License: CC0 1.0 (Quaternius releases all packs as CC0; Poly Pizza republishes under the same terms)
- Commercial use: Yes
- Attribution required: No
- Original file size: 328,416 bytes (~321 KB)
- Final file size: 328,416 bytes (unmodified)
- Modifications: none
- Date accessed: 2026-07-31

---

## big-tree.glb
- Asset title: (pre-existing asset, moved into this folder from public/models/)
- Creator: unrecorded — predates this task
- Source page: unrecorded
- License: unrecorded — please backfill if known
- Commercial use: unrecorded
- Attribution required: unrecorded
- Original file size: 3,407,832 bytes (~3.4 MB)
- Final file size: 3,407,832 bytes (unmodified)
- Modifications: none (relocated only)
- Date accessed: predates 2026-07-31 (moved into farm/ on 2026-07-31)
- Used by: fallen-tree and tree-root obstacle visuals in gameEngine.ts (obstacle mesh swap, not decorative)

## forklift.glb
- Asset title: (pre-existing asset, moved into this folder from public/models/)
- Creator: unrecorded — predates this task
- Source page: unrecorded
- License: unrecorded — please backfill if known
- Commercial use: unrecorded
- Attribution required: unrecorded
- Original file size: 137,564 bytes (~134 KB)
- Final file size: 137,564 bytes (unmodified)
- Modifications: none (relocated only)
- Date accessed: predates 2026-07-31 (moved into farm/ on 2026-07-31)
- Used by: forklift obstacle visual in gameEngine.ts (obstacle mesh swap, not decorative)

## barrier-fixed.glb / tractor.glb
- Status: present in this folder but currently unreferenced by any code in gameEngine.ts.
- Original file size: barrier-fixed.glb 146,784 bytes; tractor.glb 1,959,224 bytes
- License: unrecorded — please backfill if these are intended for future use; not wired into the game at this time.

---

_Entries above are placeholders pending asset delivery — fill in before deploying
any of these files. Do not commit or ship a GLB whose entry is incomplete._
