---
source: tests/unit/scripts/pairing/paired-frontend-path.test.ts
sha256: 3058ed8b2a1086e5f61a3cb86cee44b37aca8301226c9017bbbbdbbb0187705b
generated_at: 2026-11-08T10:39:42.219509+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/pairing/paired-frontend-path.test.ts

## Purpose

Unit tests for `resolveFrontendPath` and `DEFAULT_FRONTEND_PATH`, verifying the three-tier resolution order (shell environment → `.env` file → sibling default) and guarding the edge cases that `npm run` itself would never surface (`.env` is read manually, not via shell). Each case runs in a throwaway temp directory so the checkout's own `.env` cannot interfere.

## Key elements

- **`resolveFrontendPath`** (imported from `scripts/pairing/paired-frontend-path`) — the function under test; returns the resolved frontend worktree path.
- **`DEFAULT_FRONTEND_PATH`** (imported from the same module) — the sibling-relative fallback; tests use it to compute the expected sibling path via `path.resolve`.
- **`writeEnvironmentFile(contents)`** — local helper that writes a `.env` file into the temp working directory.
- **`sibling()`** — local helper that resolves `DEFAULT_FRONTEND_PATH` relative to the current working directory.
- **`setProcessEnvironment`** (from `@tests/environment`) — used to set or clear `FRONTEND_PATH` in `process.env` per case.
- **`beforeEach` / `afterEach`** — create a `mkdtempSync` directory, mock `process.cwd()` to it, and clean up with `rmSync(…, { recursive: true, force: true })`.

## Relationships

- **`scripts/pairing/paired-frontend-path.ts`** — the module under test; the file imports `resolveFrontendPath` and `DEFAULT_FRONTEND_PATH` and asserts its behavior.
- **`tests/support/environment.ts`** — provides `setProcessEnvironment`, used to inject or clear `FRONTEND_PATH` in `process.env` without manually mutating the object.

## Notes

- The test never calls `dotenv` or similar; it asserts that reading `.env` does **not** pollute `process.env` (see the "merges nothing from .env into the environment" case).
- Whitespace-only shell values (`'   '`) are treated as unset, causing fallback to `.env` or the sibling default.
- An empty `FRONTEND_PATH=` line (as copied from `.env-example`) must resolve to the sibling default, **not** to the current working directory.
- The header comment notes this file mirrors a sibling spec in another repo (`paired-backend-path.spec.ts`); keep the two in sync when adding cases.
