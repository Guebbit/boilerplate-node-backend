---
source: scripts/ops/demo-remove-scenarios.ts
sha256: e83209e3128ba84046b918fe6051332251dad82314928cb8b96afa09a234de69
generated_at: 2026-10-14T07:22:12.731816+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/demo-remove-scenarios.ts

## Purpose

Handles the "demo scenario data" half of the demo-removal strip: deletes the `scenarios/` files and seed-image assets that exist solely to feed the shop catalogue modules (products, wishlist, order book), and edits the few shared files a foundation-only deployment still retains (named accounts, address books, locale entries, webhook subscription). It sits alongside `demo-remove-modules.ts` as one of two halves orchestrated by `demo-remove.ts`.

## Key elements

- **`replaceOnce` / `removeOnce`** (internal helpers) — exact-match and regex replacements that **throw** when the expected text/shape is absent, so a drifted file fails loudly instead of producing a half-edited result. Both use a function replacer to avoid `$&`/`$1` interpretation in the replacement string.
- **`SHOP_ONLY_FILES`** — constant list of six `scenarios/` paths (products, wishlist, shop-history, backdate, etc.) that are deleted outright because nothing outside the shop reads them.
- **`removeShopOnlyScenarioFiles(repoRoot)`** — calls `rmSync` on each entry in `SHOP_ONLY_FILES`; returns one `RemovalNote` per file.
- **`removeSeedImages(repoRoot)`** — recursively deletes `public/images/seed/`, the generated JSON manifest, the `generate-seed-images.ts` tool, the `scenario:images` npm script in `package.json`, and strips the avatar spread + import from `scenarios/users.ts`.
- **`stripScenarioModuleEntries(repoRoot, names)`** — for each named module: deletes `scenarios/<name>.ts`, removes its import line and table entry from `scenarios/shop-modules.ts`, and prunes its name from any other entry's `after` list.
- **`stripModuleDoubles(repoRoot, names)`** — deletes `scenarios/support/doubles/<name>/` and removes the corresponding import + registration call from `scenarios/support/doubles/register.ts`.
- **`stripShopModulesTable(repoRoot)`** — rewords two comments in `shop-modules.ts` that referenced the now-deleted `flows/shop-history.ts` (keeps the conceptual explanation, updates the code references).
- **`stripScenarioIndex(repoRoot)`** — edits `scenarios/index.ts` to drop the shop's drive step and pinned subjects, falling back to the `blank` profile.

## Relationships

- **`scripts/ops/demo-remove-registry.ts`** — provides the `RemovalNote` type imported here; every exported function returns one or more of these notes.
- **`scripts/ops/demo-remove.ts`** — the orchestrator that calls this file's exports (alongside `demo-remove-modules.ts`) and aggregates the returned notes.
- **`scripts/ops/demo-remove-modules.ts`** — the sibling "module code" half of the same strip; operates on `src/modules/` while this file operates on `scenarios/`.
- **`tests/unit/scripts/ops/demo-remove-doubles.test.ts`** — unit-tests `stripModuleDoubles` against fixture copies.
- **`tests/unit/scripts/ops/demo-remove-seed-images.test.ts`** — unit-tests `removeSeedImages` (file deletion, `package.json` edit, `users.ts` edits).
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — CI mutation test that exercises the full strip including this file.

## Notes

- All edits are **exact known-string substitutions**, not a general-purpose codemod. If the target file has been refactored since the script was written, the first mismatch throws and aborts — there is no "best-effort" path.
- `rmSync` is called with `{ force: true }` everywhere, so a file that was already deleted is a silent no-op rather than an error.
- The `after`-list cleanup in `stripScenarioModuleEntries` removes the entire `after:` property when it becomes empty, rather than leaving `after: []`.
- `stripShopModulesTable` exists because the `local/comment-links` lint rule rejects dangling path references in comments; the comments are **reworded**, not deleted, so the conceptual guidance survives.
