---
source: scripts/scaffold/demo-remove-scenarios.ts
generated_at: 2026-11-22T02:15:00.435251+00:00
model: claude-code:claude-sonnet-5-5
---

# scripts/scaffold/demo-remove-scenarios.ts

## Purpose
Handles the "demo scenario data" half of stripping the demo shop from the scaffold: it deletes files under `scenarios/` (and `public/images/seed/`) that exist only to give the shop's modules something to show. It only deletes. The lists that name those files (fixture table, scenario registry, doubles registry) are regenerated from the tree afterwards by `npm run regenerate`. The one exception is the seed-image avatar spread, which is edited by regex.

## Key elements
- `removeOnce(content, pattern, label)` (internal): removes every match of a regex and throws if nothing matches. This flags that the expected file shape has changed.
- `SHOP_ONLY_FILES` (internal): the fixed list of shop-catalogue scenario files (`scenarios/product-ids.ts`, `scenarios/products.ts`, `scenarios/products-filler.ts`, `scenarios/products-images.generated.json`, `scenarios/shop.scenario.ts`, `scenarios/wishlist.ts`, `scenarios/flows/shop-history.ts`, `scenarios/flows/backdate.ts`).
- `removeShopOnlyScenarioFiles(repoRoot)`: force-deletes each file in `SHOP_ONLY_FILES` and returns a `RemovalNote` for each.
- `removeSeedImages(repoRoot)`:
  - Deletes the whole `public/images/seed/` folder.
  - Deletes the user avatars' generated manifest (the `users-images.generated.json` file under `scenarios/`) and `scenarios/tools/generate-seed-images.ts`.
  - Removes the `"scenario:images"` script line from `package.json`.
  - In `scenarios/users.ts`, drops the `userImages` import and the trailing `...userImages.*` spread (including the conditional `index % 2` form) from each seeded user.
  - Returns notes for each change.
- `removeScenarioModuleFiles(repoRoot, names)`: for each removed module name, deletes `scenarios/<name>.ts`, `scenarios/values/<name>.ts` and `scenarios/support/doubles/<name>/`, whichever exist. It returns one note per deleted path, and nothing for a module with none.

## Relationships
- Imports the `RemovalNote` type from `demo-remove-registry.ts`; every function returns `RemovalNote[]`.
- Companion to `demo-remove-modules.ts` and orchestrated by `demo-remove.ts`, which presumably calls these functions as part of the demo strip. This is not shown in this file.
- Covered by tests: `demo-remove-scenario-files.test.ts` (scenario file removal) and `demo-remove-seed-images.test.ts` (seed image removal). `waves.test.ts` is also listed as a neighbor, but this file shows no direct interaction with it.

## Notes
- Deletions use `force: true`, so missing files are silently ignored. Only the `package.json` and `users.ts` edits are strict: `removeOnce` throws if the `scenario:images` line or the `userImages` import isn't found.
- The `package.json` regex expects the script on a line indented with exactly 8 spaces.
- The avatar-spread regex relies on the spread always being a user's last property.
- Nothing here edits the registries. Run `npm run regenerate` afterwards, which also covers `DEFAULT_SCENARIO` and the generated client collections' example values.
