---
source: scripts/scaffold/demo-remove.ts
sha256: 01e584b061e680afc688a2674e4301ab651554ed2fe2f89adf16c502ae3fb832
generated_at: 2026-11-08T02:59:21.797491+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/demo-remove.ts

## Purpose

Entry-point script for `npm run demo:remove`. In a single run it deletes every module folder tagged `group: shop` or `group: example` (including their scheduled jobs and owned tests), removes seed images and shop-only scenario files, and regenerates the scenario registries so the repo still compiles. It operates directly on the current checkout.

## Key elements

- **`report(notes)`** – Prints one `console.info` line per `RemovalNote` (file + detail).
- **`demoModuleNames`** – Module list discovered at runtime via `readDemoModuleNames(REPO_ROOT)`; used to scope the removal.
- **Step 1 – `removeModules`** – Deletes the module folders and edits central files (e.g. `src/modules.ts`) that reference them.
- **Step 2 – `removeSeedImages` / `removeShopOnlyScenarioFiles`** – Deletes the demo catalogue's seed images and scenario data files. No central files are edited here.
- **Step 3 – `writeScenarioRegistries`** – Regenerates the scenario registry files from what remains, formatted via `formatWithRepoConfig`. Runs asynchronously; on success prints next-step instructions, on failure delegates to `failScript`.
- **Post-strip guidance** – Two manual follow-up commands printed to the console: `npm run regenerate` and `npm run ts-check`.

## Relationships

- **`scripts/fail-script.ts`** → imported as `failScript`; the `.catch` handler for the async registry-write step.
- **`scripts/modules-on-disk.ts`** → imported as `REPO_ROOT`; provides the filesystem root used by every other step.
- **`scripts/scaffold/demo-remove-modules.ts`** → imported as `removeModules`; performs step 1 (folder deletion + central-file edits).
- **`scripts/scaffold/demo-remove-registry.ts`** → imported as the `RemovalNote` type; shapes the report output.
- **`scripts/scaffold/demo-remove-scenarios.ts`** → imported as `removeSeedImages` and `removeShopOnlyScenarioFiles`; performs step 2.
- **`scripts/scaffold/format-text.ts`** → imported as `formatWithRepoConfig`; formatter passed into `writeScenarioRegistries`.
- **`scripts/scaffold/scenario-registry.ts`** → imported as `writeScenarioRegistries`; performs step 3 (async).
- **`scripts/testing/demo-module-names.ts`** → imported as `readDemoModuleNames`; discovers which module folders qualify for removal.

## Notes

- The script executes side-effects at import time (top-level `console.info` and function calls); it is not a library module.
- It runs against the live checkout, not a scratch copy — there is no dry-run or backup step.
- A test file that *imports* a removed module is deleted alongside it (handled inside `removeModules`), but tests in unrelated packages that still reference the module by name in a string or table will **not** be caught; the user must fix those after running `npm run ts-check`.
- The async boundary is only at step 3; steps 1 and 2 are synchronous and run before any `await`.
