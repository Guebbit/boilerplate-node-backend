---
source: scripts/ops/demo-remove-scenarios.ts
sha256: 4448a60601bee874143cb73d833a0d3d8d7c716fa29d2ec2bc28273ccac568cd
generated_at: 2026-10-01T12:35:20.154892+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/demo-remove-scenarios.ts

## Purpose

Step 3 of the G-D2 demo-removal sequence: handles the "demo scenario data" half. It deletes shop-specific scenario files (products, wishlist, shop-history flows) and performs targeted text edits in shared scenario files (`shop-modules.ts`, `index.ts`, `subjects.ts`) so that a foundation-only deployment no longer references the removed catalogue. Every edit is an exact-string substitution rather than a general codemod, because the target files are hand-authored prose and object literals.

## Key elements

- **`replaceOnce`** (internal) — replaces the first occurrence of a literal string; throws if the string is absent, so a drifted file fails loudly instead of writing a half-right result. Uses a function replacer to avoid `$&`/`$1` pattern interpretation.
- **`SHOP_ONLY_FILES`** (internal) — the six files under `scenarios/` that exist solely for the shop catalogue.
- **`removeShopOnlyScenarioFiles(repoRoot)`** — deletes every file in `SHOP_ONLY_FILES` (forced, no-op if missing). Returns `RemovalNote[]`.
- **`removeGeneratedProductImages(repoRoot)`** — reads `scenarios/products-images.generated.json`, then unlinks every `imageUrl`/`thumbnailUrl` it lists under `public/`. Must run *before* the manifest itself is deleted.
- **`stripScenarioModuleEntries(repoRoot, names)`** — generic over module names: deletes each `scenarios/<name>.ts`, removes its import and table entry from `scenarios/shop-modules.ts`, and strips the name from any `after:` list. Shared by full `demo:remove` and single-module removal.
- **`stripShopModulesTable(repoRoot)`** — rewords two doc-comments in `shop-modules.ts` that named the now-deleted `flows/shop-history.ts` (keeps the comments' substance, updates the reference).
- **`stripScenarioIndex(repoRoot)`** — edits `scenarios/index.ts`: removes the `driveShopHistory`/`backdateHistory` imports and drive step, drops `SHOP_SUBJECTS`, flips `DEFAULT_SCENARIO` from `'shop'` to `'blank'`, and generalises the `drive` return type from `ShopHistory` to `Readonly<Record<string, string>>`.
- **`stripSubjects(repoRoot)`** — removes catalogue-specific exports (e.g. `SEED_PRODUCT_IDS`) from `scenarios/subjects.ts`, keeping the admin/user pair.

## Relationships

- **`scripts/ops/demo-remove.ts`** — the orchestrator that invokes the functions in this file as step 3 of the removal pipeline.
- **`scripts/ops/demo-remove-registry.ts`** — exports the `RemovalNote` type that every function here returns; also the registry the orchestrator consults to decide which steps to run.
- **`scripts/ops/demo-remove-modules.ts`** — sibling step (step 2) that removes the module source code; this file handles the scenario-data side. Both feed notes into the same registry.

## Notes

- **Ordering constraint:** `removeGeneratedProductImages` reads the JSON manifest before `removeShopOnlyScenarioFiles` deletes it. The orchestrator must call the image-removal step first.
- **Fail-loud by design:** every `replaceOnce` call throws if its target string is missing. If a file has been manually edited since the script was written, the run aborts rather than silently writing a wrong file.
- **`stripScenarioModuleEntries` is generic:** it accepts an arbitrary `names` array, so it is reused for both the full shop removal and any future single-module teardown.
- The `drive` type change in `stripScenarioIndex` decouples backdating from the harness: a scenario that needs backdating must call it inside its own `drive` function.
