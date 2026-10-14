---
source: scripts/scaffold/demo-remove.ts
sha256: c802e13bf8ceebbe5dcd3ff3bb71a445907da419472b07ec07514c4d1a34423f
generated_at: 2026-10-14T14:32:46.008684+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/demo-remove.ts

## Purpose

The `npm run demo:remove` command. It performs the actual one-command removal of every `group: shop` / `group: example` module folder, its associated scripts, seed images, scenario data, and the central-file references that would otherwise break compilation. Unlike its report-only twin (`measure:demo-strip`), this script mutates the **live checkout** directly.

## Key elements

- **`REPO_ROOT`** — resolves the repo root (two levels up from `scripts/scaffold/`) via `path.resolve(__dirname, '..')`.
- **`report(notes)`** — iterates a `RemovalNote[]` and prints each `{file, detail}` line to stdout.
- **`demoModuleNames`** — populated once at load time by `readDemoModuleNames(REPO_ROOT)`; drives which folders are stripped.
- **Step 1 — `removeModules(REPO_ROOT, demoModuleNames)`** — deletes the module directories and edits central files (`src/modules.ts`, contract bundles, `scenarios/*`) that reference them.
- **Step 2 — catalogue strip** — calls `removeSeedImages`, `removeShopOnlyScenarioFiles`, then the `strip*` family (`stripShopModulesTable`, `stripScenarioIndex`, `stripSubjects`, `stripDemoJobs`, `stripClientCollections`) to remove demo data and the files that listed it.
- **Trailing "Next" block** — prints two manual follow-up commands (`npm run regenerate`, `npm run ts-check`) and a note that residual references in strings/tables must be fixed by hand.

## Relationships

- **`scripts/testing/demo-module-names.ts`** — source of `readDemoModuleNames`, which determines the list of module folders to remove.
- **`scripts/scaffold/demo-remove-modules.ts`** — provides `removeModules`, the core folder-delete + central-file-edit routine used in Step 1.
- **`scripts/scaffold/demo-remove-registry.ts`** — source of the `RemovalNote` type used for structured reporting lines.
- **`scripts/scaffold/demo-remove-scenarios.ts`** — provides all Step-2 helpers: `removeSeedImages`, `removeShopOnlyScenarioFiles`, `stripClientCollections`, `stripScenarioIndex`, `stripShopModulesTable`, `stripSubjects`, `stripDemoJobs`.

## Notes

- This script **does not** regenerate bundles or run the type-checker; it deliberately leaves those as manual post-steps so the operator can inspect what still fails.
- The doc comment references `demo-remove-tests.ts` as the companion that strips non-module-owned tests importing a removed module, but that file is **not** imported or called here — test cleanup is presumably invoked separately or handled inside `removeModules`.
- The script is idempotent in reporting (each step prints its own notes) but **not** in effect: running it twice against an already-stripped repo will produce empty or no-op reports, since the targets will no longer exist.
- `REPO_ROOT` is computed from `__dirname`, so the script must live at `scripts/scaffold/` relative to the repo root.
