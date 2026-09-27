---
source: tests/unit/scripts/pairing/paired-frontend-path.test.ts
sha256: f44cffab7d3bb0dd24fc2698349190697380bf8f8890eb0a8f8a99d305ba4633
generated_at: 2026-09-27T16:14:05.313171+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/pairing/paired-frontend-path.test.ts

## Purpose

Unit tests for `resolveFrontendPath`, verifying that the resolver honors its three-source priority (shell env → `.env` file → sibling default) and handles edge cases like empty/whitespace values, relative paths, and environment non-leakage. Each case runs in a throwaway temp directory so the repo's own `.env` never interferes.

## Key elements

- **`writeEnvironmentFile(contents)`** – Writes a `.env` file into the case's working directory.
- **`sibling()`** – Computes the expected sibling-default path (`path.resolve(workingDirectory, DEFAULT_FRONTEND_PATH)`) for assertions.
- **`beforeEach` / `afterEach`** – Creates a unique `mkdtemp` directory, mocks `process.cwd()` to point there, clears `FRONTEND_PATH`; teardown removes the dir, restores all mocks, and restores the original `FRONTEND_PATH` (or deletes it if it was absent).
- **`describe('resolveFrontendPath')`** – Seven test cases:
  - No shell value, no `.env` → sibling default.
  - `.env` value is used (the case `npm run` misses).
  - Shell value wins over `.env`.
  - Whitespace-only shell value is treated as unset; `.env` is read instead.
  - `.env` with empty `FRONTEND_PATH=` (as in `.env-example`) is treated as unset, not as the current directory.
  - Relative `.env` value is resolved against the working directory.
  - Reading `.env` does **not** write any key back into `process.env`.

## Relationships

- **`scripts/pairing/paired-frontend-path.ts`** – The sole production dependency. This file imports `DEFAULT_FRONTEND_PATH` (used to build expected sibling paths) and `resolveFrontendPath` (the function under test). No other module is imported or exercised.

## Notes

- The resolution order (shell → `.env` → sibling) is the contract; the tests are ordered to mirror it.
- The empty-value tests guard against a real pitfall: `.env-example` ships `FRONTEND_PATH=` (empty), and a naive reader would interpret that as "use the current directory."
- The non-leakage test (`PAIRED_PATH_PROBE`) asserts that the resolver parses `.env` in isolation without mutating `process.env`, which matters because callers may rely on the environment being untouched.
- The file header notes this mirrors a backend counterpart at `<paired-frontend>/tests/unit/scripts/pairing/paired-backend-path.spec.ts`.
