---
source: tests/cross-cutting/modules-are-enabled.test.ts
sha256: 951575fe0f35a8297aa983233ae86f84aaa6c1e02ada15a841fae5caf5ac8f2f
generated_at: 2026-11-08T09:28:27.662501+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/modules-are-enabled.test.ts

## Purpose

A guard test that fails if any directory under `src/modules/` is missing from the `enabledModules` registry. It exists because a module that is on disk but not registered fails silently—no boot error, no obvious 404 during development—so the first symptom is a missing endpoint in production.

## Key elements

- **`moduleFolders()`** — Reads `MODULES_ROOT` via `readdirSync` + `statSync` and returns the names of subdirectories only. This is the set of modules that *exist on disk*.
- **"finds folders to check"** — Canary assertion: `moduleFolders()` must be non-empty. Prevents the second test from passing vacuously if the sweep itself is broken (e.g., wrong path).
- **"enables every module folder that exists"** — Asserts that every folder name appears as an `AppModule.name` value in `enabledModules`. Reports the list of missing names via `expect(missing).toEqual([])`.

## Relationships

- **`src/modules.ts`** — Source of truth for the registry. The test imports `enabledModules` and checks that each entry's `.name` matches a folder name on disk.
- **`tests/support/paths.ts`** — Provides the `MODULES_ROOT` constant (resolved absolute path to `src/modules/`) so the test does not hard-code a relative path.

## Notes

- The contract is **folder name ≡ `AppModule.name`**, as documented on `AppModule` in `src/kernel/registry.ts`. If you rename a folder without renaming the module's `.name` (or vice versa), this test is the first to catch it.
- The canary test is intentional: without it, a misconfigured `MODULES_ROOT` (pointing to an empty or wrong directory) would make the main assertion pass with an empty set, giving a false green.
- Only directories are considered; loose files under `src/modules/` are ignored by design.
