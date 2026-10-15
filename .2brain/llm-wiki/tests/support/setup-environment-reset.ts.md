---
source: tests/support/setup-environment-reset.ts
sha256: 84881e9c86e2bb53727305b504e8a669dec7e5b1eda7181b0547aea921bb916c
generated_at: 2026-10-15T13:01:34.346609+00:00
model: ollama:qwen3.8:27b
---

# tests/support/setup-environment-reset.ts

## Purpose

Jest `setupFilesAfterEnv` hook that snapshots the current environment-override state at file load time, then resets all overrides (and process-env changes) after every test case. This makes "restore after" structurally guaranteed rather than something each test must remember, preventing an override set in one case from silently leaking into later cases.

## Key elements

- **`markEnvironmentOverrides()`** — called once at module load (top-level). Records the current set of overrides as the "starting point" that every case will be reset back to.
- **`afterEach` callback** — runs after every test in the file regardless of `describe` nesting. Calls `resetEnvironmentOverrides()` to revert config-store overrides to the marked snapshot, then `restoreProcessEnvironment()` to undo any `process.env` mutations.

## Relationships

- **`src/infrastructure/config/store.ts`** — provides `markEnvironmentOverrides` and `resetEnvironmentOverrides`, the config-store primitives this file orchestrates.
- **`tests/support/environment.ts`** — provides `restoreProcessEnvironment`, which the `afterEach` calls to roll back direct `process.env` changes made during a test.
- Must be listed **after** `setup-file-sandbox.ts` in the `setupFilesAfterEnv` array so the sandbox's directories are already in place when `markEnvironmentOverrides` snapshots the state.

## Notes

- The file's effect is entirely top-level side effects (the `markEnvironmentOverrides()` call and the `afterEach` registration). There are no exports; importing it for side effects is the only use.
- "Reset to the marked snapshot" means overrides introduced *between* file load and the first test (e.g., by the sandbox setup) are preserved. Only overrides set *during* a test case are rolled back.
- If a test file needs a different baseline per `describe` block, this mechanism won't help—the snapshot is per-file, not per-suite.
