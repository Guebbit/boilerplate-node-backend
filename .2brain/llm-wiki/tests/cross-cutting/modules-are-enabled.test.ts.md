---
source: tests/cross-cutting/modules-are-enabled.test.ts
sha256: f73e9a83c4057601678fb91cf760f0a17afcbe49ee6e3fee7340739f41da04b5
generated_at: 2026-09-27T15:51:18.209258+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/modules-are-enabled.test.ts

## Purpose

A cross-cutting integration test that enforces bidirectional consistency between the `src/modules/` directory tree and the `enabledModules` array in `src/modules.ts`. It exists because a module folder missing from `enabledModules` fails silently (no boot error, no 404 during dev), and a name in `enabledModules` with no corresponding folder is dead config.

## Key elements

- **`moduleFolders()`** — reads `MODULES_ROOT` via `readdirSync` + `statSync` and returns the names of all subdirectories (i.e., the module folders on disk).
- **`describe('modules are enabled')`** — contains three assertions:
  - *Canary*: `moduleFolders()` is non-empty, so the sweep below cannot pass vacuously.
  - *Folder → enabled*: every folder name appears in `enabledModules.map(m => m.name)`.
  - *Enabled → folder*: every `appModule.name` in `enabledModules` corresponds to an actual folder.

## Relationships

- **`src/modules.ts`** — exports `enabledModules`; this test is the sole consumer asserting that its `.name` fields are in 1-to-1 correspondence with the directory tree.
- **`tests/support/paths.ts`** — provides the `MODULES_ROOT` constant (imported via the `@tests/paths` alias), anchoring the filesystem scan to the project's `src/modules/` directory regardless of CWD.

## Notes

- The test relies on the documented invariant (`src/kernel/registry.ts`) that `AppModule.name` equals its folder name. If that convention changes, both the `enabledModules` entries and this test must be updated together.
- The canary test (`length > 0`) is intentional guard-rail: without it, a misconfigured `MODULES_ROOT` would cause the two substantive assertions to pass vacuously with an empty array.
- Only directories are collected; stray files under `src/modules/` are ignored.
