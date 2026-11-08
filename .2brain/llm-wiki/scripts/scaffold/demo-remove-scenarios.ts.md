---
source: scripts/scaffold/demo-remove-scenarios.ts
sha256: 4fde6019b16907e6d6f944ce669cb2ff54fd327f609119e34a73e48009cc2eea
generated_at: 2026-11-08T02:58:46.169454+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/demo-remove-scenarios.ts

## Purpose

The "scenario data" half of the demo-removal strip. It deletes the files under `scenarios/` (product fixtures, seed images, per-module values and doubles) that exist solely to give the shop's own modules something to display. It only performs deletions and a small set of targeted content edits; the registries that list these files are regenerated separately by `npm run regenerate`.

## Key elements

- **`removeOnce`** (internal) — removes a single regex match from a string; throws if the expected shape is absent, acting as a guard against file-structure drift.
- **`SHOP_ONLY_FILES`** (internal) — hard-coded list of eight scenario paths (products, wishlist, flows, generated images) that belong exclusively to the shop catalogue.
- **`removeShopOnlyScenarioFiles(repoRoot)`** — `rmSync`s every path in `SHOP_ONLY_FILES`; returns one `RemovalNote` per file.
- **`removeSeedImages(repoRoot)`** — recursively deletes `public/images/seed/`, the image manifest, the `generate-seed-images.ts` tool, the `"scenario:images"` npm script entry, and the avatar-spread lines in `scenarios/users.ts`. The only export that edits file *content* rather than just deleting files.
- **`removeScenarioModuleFiles(repoRoot, names)`** — for each removed module name, deletes `scenarios/<name>.ts`, `scenarios/values/<name>.ts`, and `scenarios/support/doubles/<name>/` (only if they exist). Returns one `RemovalNote` per deleted path.

## Relationships

- **`scripts/scaffold/demo-remove-registry.ts`** — provides the `RemovalNote` type that every exported function returns.
- **`scripts/scaffold/demo-remove.ts`** — the orchestrator that calls this module's exports alongside the registry and module halves of the strip.
- **`scripts/scaffold/demo-remove-modules.ts`** — sibling step that deletes module *code*; this file handles the scenario *data* that referenced it. `removeScenarioModuleFiles` consumes the module names produced there.
- **`tests/unit/scripts/scaffold/demo-remove-scenario-files.test.ts`** — unit tests for `removeShopOnlyScenarioFiles` and `removeScenarioModuleFiles`.
- **`tests/unit/scripts/scaffold/demo-remove-seed-images.test.ts`** — unit tests for `removeSeedImages`, covering the content-editing path in `users.ts` and `package.json`.
- **`tests/unit/scripts/mutation/ci/waves.test.ts`** — verifies the CI wave ordering in which this strip step runs.

## Notes

- The file **never writes generated registries** (fixture table, scenario registry, doubles registry). Those are rebuilt by `npm run regenerate` after deletion.
- `removeSeedImages` is the sole exception to "delete only": it regex-removes the `"scenario:images"` script line from `package.json` and strips avatar-spread expressions from `scenarios/users.ts`. The avatar regex handles both a plain spread (`,\n ...userImages.customer`) and a conditional ternary spread.
- `removeOnce` throws on a shape mismatch by design — if a target file has been restructured, the script fails loudly rather than silently leaving dangling references.
- `SHOP_ONLY_FILES` is a static list; adding a new shop-only scenario file requires updating it here.
