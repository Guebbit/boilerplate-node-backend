---
source: scripts/scaffold/demo-remove.ts
sha256: 14190ac619ed058ec58273a1d983abef8403227dba5e4c113785dcb412792398
generated_at: 2026-10-29T01:43:05.607473+00:00
model: ollama:qwen3.8:27b
---

# scripts/scaffold/demo-remove.ts

## Purpose

Entry point for `npm run demo:remove`. Strips every module labelled `group: shop` or `group: example` from the live checkout—deleting their folders, associated seed images, and shop-only scenario files—then regenerates the scenario registries so the repo still compiles. It is the "real" one-command strip; its measuring twin (`measure:demo-strip`) runs the same recipe against a scratch copy.

## Key elements

- **`report(notes: RemovalNote[])`** — Local helper that prints one `file — detail` line per `RemovalNote`. Used after each step to show what was deleted.
- **`demoModuleNames`** — Resolved once at module-load time via `readDemoModuleNames(REPO_ROOT)`; drives the entire strip.
- **Step 1 – `removeModules(REPO_ROOT, demoModuleNames)`** — Deletes the module folders and edits the central files (`src/modules.ts`) that reference them.
- **Step 2 – `removeSeedImages` / `removeShopOnlyScenarioFiles`** — Deletes the demo catalogue's seed images and shop-only scenario data. No registry edits here.
- **Step 3 – `writeScenarioRegistries(REPO_ROOT, formatWithRepoConfig)`** — The sole async step. Rebuilds the generated scenario registries from whatever remains, then prints the two follow-up commands the operator must run manually.
- **Tail `.catch(failScript)`** — Routes any unhandled rejection in the registry write through the shared failure handler.

## Relationships

| Neighbor | Interaction |
|---|---|
| `scripts/testing/demo-module-names.ts` | Provides `readDemoModuleNames` to discover which folders to remove. |
| `scripts/modules-on-disk.ts` | Provides `REPO_ROOT` (the filesystem anchor for every operation). |
| `scripts/scaffold/demo-remove-modules.ts` | Provides `removeModules` — the folder + central-file deletion in step 1. |
| `scripts/scaffold/demo-remove-registry.ts` | Supplies the `RemovalNote` type used by `report`. |
| `scripts/scaffold/demo-remove-scenarios.ts` | Provides `removeSeedImages` and `removeShopOnlyScenarioFiles` (step 2). |
| `scripts/scaffold/format-text.ts` | Provides `formatWithRepoConfig`, passed as the formatter to `writeScenarioRegistries`. |
| `scripts/scaffold/scenario-registry.ts` | Provides `writeScenarioRegistries` (step 3). |
| `scripts/fail-script.ts` | Provides `failScript`, the `.catch` handler for the async registry write. |

## Notes

- Runs against **this checkout**, not a scratch copy. The doc header explicitly contrasts it with the `measure:demo-strip` twin.
- The doc comment references `demo-remove-tests.ts` for removing stray tests that import a deleted module, but that file is **not imported** here—test cleanup is handled elsewhere (likely inside `removeModules` or a separate invocation).
- The script does **not** verify its own result. The operator must manually run `npm run regenerate` and `npm run ts-check` and fix any remaining string/table references to the removed modules.
- Steps 1 and 2 are synchronous; only step 3 (`writeScenarioRegistries`) is async, which is why the tail uses `.then/.catch` rather than top-level `await`.
