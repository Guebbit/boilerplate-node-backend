---
source: scripts/scaffold/demo-remove-scenarios.ts
sha256: e83209e3128ba84046b918fe6051332251dad82314928cb8b96afa09a234de69
generated_at: 2026-10-14T14:32:05.269887+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/demo-remove-scenarios.ts

## Purpose

The "demo scenario data" half of the demo-strip operation. It deletes the files under `scenarios/` and `public/images/seed/` that exist solely to give shop-specific modules (products, wishlist, shop-history) something to display, and edits shared files (`shop-modules.ts`, `index.ts`, `users.ts`, `package.json`) to remove references to those deleted pieces. It is called by `demo-remove.ts` as part of a full or single-module removal, not run standalone.

## Key elements

- **`removeShopOnlyScenarioFiles(repoRoot)`** — Deletes the six files listed in `SHOP_ONLY_FILES` (products, wishlist, shop-history, backdate scenarios and their filler/images). Returns one `RemovalNote` per file.
- **`removeSeedImages(repoRoot)`** — Recursively deletes `public/images/seed/`, the user-image manifest, the seed-image generator script, the `"scenario:images"` npm script in `package.json`, and the `userImages` import + avatar spreads in `scenarios/users.ts`. Returns five notes.
- **`stripScenarioModuleEntries(repoRoot, names)`** — For each removed module name: deletes `scenarios/<name>.ts`, removes its import and table entry from `scenarios/shop-modules.ts`, and strips its name from other entries' `after` arrays. One shared `RemovalNote`.
- **`stripModuleDoubles(repoRoot, names)`** — For each name that has a folder under `scenarios/support/doubles/`: deletes the folder, removes the named import and its `register()` call from the shared `register.ts`. One note per module that had doubles.
- **`stripShopModulesTable(repoRoot)`** — Rewrites two multi-line comments in `shop-modules.ts` that referenced the now-deleted `flows/shop-history.ts`, replacing them with equivalent prose that no longer names that file.
- **`stripScenarioIndex(repoRoot)`** — Edits `scenarios/index.ts` to drop the `driveShopHistory`/`backdateHistory` imports and the `shop` entry's drive/subjects, falling back to `blank`.
- **`replaceOnce`** (internal) — Replaces the first occurrence of an exact string; throws if the string is absent. Uses a function replacer to prevent `$&`-style pattern interpretation.
- **`removeOnce`** (internal) — Removes the first match of a RegExp; throws if nothing matches.

## Relationships

- **`demo-remove.ts`** — Orchestrator that imports and calls these functions in sequence as part of the full removal pipeline.
- **`demo-remove-modules.ts`** — The "modules" half of the same strip (source code, routes, etc.); operates on different file sets but runs in the same invocation.
- **`demo-remove-registry.ts`** — Provides the `RemovalNote` type that every function in this file returns.
- **`tests/unit/scripts/scaffold/demo-remove-doubles.test.ts`** — Unit tests for `stripModuleDoubles`.
- **`tests/unit/scripts/scaffold/demo-remove-seed-images.test.ts`** — Unit tests for `removeSeedImages`.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — CI wave test that exercises the mutation/removal path end-to-end, covering this file's effects.

## Notes

- Every substitution is an exact, hand-written string or narrowly scoped RegExp — not a general codemod. If a file has drifted from the expected shape, `replaceOnce`/`removeOnce` throw immediately rather than writing a half-edited file.
- The `SHOP_ONLY_FILES` list is a closed constant; adding a new shop-only scenario file requires updating it here.
- `stripModuleDoubles` reads the exported function name from the import line in `register.ts` rather than hard-coding it, so any naming convention works as long as the import matches `import { <name> } from './<module>/register'`.
- `stripShopModulesTable` is not generic over module names — it rewrites two specific comments. It is only correct while `flows/shop-history.ts` is the referenced file; a different deletion would need new `replaceOnce` calls.
- The `after`-array cleanup in `stripScenarioModuleEntries` also removes the property entirely when it becomes empty, and preserves a leading comma when one was present.
