---
source: scripts/scaffold/demo-remove.ts
sha256: 53ac48ebdf63c9677880688afa1a2cd60fef6a96e658868502b2f6a7c85bac7d
generated_at: 2026-10-15T09:46:48.138432+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/demo-remove.ts

## Purpose

CLI entry point for `npm run demo:remove`. Strips every module labelled `group: shop` or `group: example` from the current checkout—folders, seed images, scenario data, and the central source files that reference them—so the repo compiles cleanly without demo content. It is the destructive counterpart to the `measure:demo-strip` twin that runs against a scratch copy.

## Key elements

- **`report(notes)`** (local) — prints one `console.info` line per `RemovalNote` (`file — detail`). Used after every removal step.
- **`demoModuleNames`** (local) — resolved once at load time via `readDemoModuleNames(REPO_ROOT)`; the list of module folder names to delete.
- **Step 1 block** — calls `removeModules(REPO_ROOT, demoModuleNames)` to delete module folders and edit the central files (`src/modules.ts`, contract bundle, scenario index) that name them.
- **Step 2 block** — calls `removeSeedImages`, `removeShopOnlyScenarioFiles`, then `stripShopModulesTable`, `stripScenarioIndex`, `stripSubjects`, `stripDemoJobs`, `stripClientCollections` to delete demo catalogue data and clean up generated/centrally-listed references.
- **Closing `console.info` block** — prints the two follow-up commands the operator must run (`npm run regenerate`, `npm run ts-check`).

The file exports nothing; it is a top-level script executed via its `#!/usr/bin/env tsx` shebang.

## Relationships

- **`scripts/modules-on-disk.ts`** — imports `REPO_ROOT` (the resolved filesystem root for all path operations).
- **`scripts/testing/demo-module-names.ts`** — imports `readDemoModuleNames` to discover which module folders carry the `group: shop` / `group: example` label.
- **`scripts/scaffold/demo-remove-modules.ts`** — imports `removeModules`, the function that actually deletes module directories and patches central source files.
- **`scripts/scaffold/demo-remove-registry.ts`** — imports the `RemovalNote` type used by `report`.
- **`scripts/scaffold/demo-remove-scenarios.ts`** — imports the seven scenario/seed-image/client-collection stripping functions called in Step 2.

## Notes

- **Destructive, in-place.** The docblock and comment stress that this runs against the real checkout, not a scratch copy. There is no dry-run flag; the operator must have a clean git state or backup before invoking it.
- **Post-run steps are mandatory.** The script itself does not regenerate bundles or type-check; it prints those two commands as instructions. Until `npm run regenerate` succeeds, generated docs and contract bundles still reference removed modules.
- **Test cleanup is split.** A module's own tests (under `src/modules/<name>/tests/`) are deleted with the folder by `removeModules`. Other tests that import a removed module are handled by `demo-remove-tests.ts` (referenced in the header comment; not imported here).
- **`stripClientCollections`** edits `scripts/contracts/client-collections-bundle.ts`; the remaining `strip*` helpers touch `scenarios/*` and `docker/crontab` / `package.json` lines. All are implemented in `demo-remove-scenarios.ts`.
