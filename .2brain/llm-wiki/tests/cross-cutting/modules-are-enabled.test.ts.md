---
source: tests/cross-cutting/modules-are-enabled.test.ts
sha256: 8ce72804de8dce4139bcf992e5bc611d9748e99d7350d0f4644fcae8c2c11e9e
generated_at: 2026-09-23T19:57:34.707156+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/modules-are-enabled.test.ts

## Purpose

Cross-cutting consistency guard that enforces a bidirectional invariant: every directory under `src/modules/` appears in `enabledModules`, and every entry in `enabledModules` corresponds to an existing directory. Catches the silent-failure mode where a module exists on disk but is never registered, surfacing the problem in CI rather than as a missing endpoint in production.

## Key elements

- **`MODULES_ROOT`** — resolved path to `src/modules/`, built from `__dirname`.
- **`moduleFolders()`** — returns the names of all immediate subdirectories of `MODULES_ROOT` (uses `readdirSync` + `statSync`).
- **`describe('modules are enabled')`** — three assertions:
    - _Canary_: at least one folder exists, so the two real checks can't pass vacuously.
    - _Forward_: every folder name is present in the `enabledModules[].name` set.
    - _Reverse_: every `enabledModules[].name` has a matching folder (no orphaned registrations).

## Relationships

- **`src/modules.ts`** — sole import target; the test reads its `enabledModules` export and validates it against the filesystem. A mismatch here is the only thing this file detects.

## Notes

- The reverse check depends on the convention that `AppModule.name` equals the folder name (documented in `src/kernel/registry.ts`). If that convention is ever relaxed, the reverse assertion will produce false positives.
- The canary test is intentional: without it, deleting the entire `src/modules/` directory would let both real assertions pass with an empty array, masking a total module loss.
- Uses `__dirname` (CJS-style) rather than `import.meta.url`; keep in mind if the project migrates to ESM.
