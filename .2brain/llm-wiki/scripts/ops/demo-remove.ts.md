---
source: scripts/ops/demo-remove.ts
sha256: 715c9f78cf7829ecc1b034f3f178cb18aa0d297f7cf69fd997c6a1f7f59cdff8
generated_at: 2026-10-14T07:22:57.814500+00:00
model: ollama:qwen3.8:27b
---

# scripts/ops/demo-remove.ts

## Purpose

One-command destructive script (`npm run demo:remove`) that strips every `group: shop` and `group: example` module from the **current checkout**: deletes their folders, associated seed images, scenario data, and `docker/crontab`/`package.json` entries, then edits the central files (`src/modules.ts`, `scripts/contracts/client-collections-bundle.ts`, scenario indexes) so the repo still compiles. It is the "real" counterpart to the report-only `measure:demo-strip` twin.

## Key elements

- **`REPO_ROOT`** — resolves the repository root two levels above `scripts/ops/`.
- **`report(notes)`** — prints each `RemovalNote` as an indented `file — detail` line.
- **`demoModuleNames`** — calls `readDemoModuleNames(REPO_ROOT)` to discover every module tagged `group: shop` or `group: example`.
- **Step 1 — `removeModules(REPO_ROOT, demoModuleNames)`** — deletes the module folders and edits the central files that reference them.
- **Step 2 — scenario & collection stripping** — calls `removeSeedImages`, `removeShopOnlyScenarioFiles`, then the five `strip*` helpers (`stripShopModulesTable`, `stripScenarioIndex`, `stripSubjects`, `stripDemoJobs`, `stripClientCollections`) to remove demo catalogue data and its generated collections.
- **Post-run instructions** — prints a two-step checklist: `npm run regenerate` (rebuild contracts/docs) and `npm run ts-check` (fix residual string/table references by hand).

## Relationships

- **`scripts/testing/demo-module-names.ts`** — imports `readDemoModuleNames`; supplies the list of demo module folders to remove.
- **`scripts/ops/demo-remove-modules.ts`** — imports `removeModules`; performs the folder deletion and central-file edits (step 1).
- **`scripts/ops/demo-remove-registry.ts`** — imports the `RemovalNote` type used by `report` for structured output.
- **`scripts/ops/demo-remove-scenarios.ts`** — imports all seven scenario/collection removal and stripping helpers (step 2).

## Notes

- Runs against the **live checkout**, not a scratch copy. The doc comment explicitly warns this is the real command.
- The script is **destructive and one-way**; there is no built-in rollback.
- After execution the repo is expected to be in a *nearly* compiling state. Remaining references that live in strings or markdown tables (rather than imports) are not caught automatically and must be fixed by hand after `ts-check`.
- The header comment references a sibling `demo-remove-tests.ts` (for tests importing removed modules) that is not imported here; it is a conceptual neighbor for the test-cleanup path.
