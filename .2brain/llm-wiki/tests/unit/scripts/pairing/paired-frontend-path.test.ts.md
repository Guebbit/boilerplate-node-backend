---
source: tests/unit/scripts/pairing/paired-frontend-path.test.ts
sha256: 3058ed8b2a1086e5f61a3cb86cee44b37aca8301226c9017bbbbdbbb0187705b
generated_at: 2026-10-15T13:29:15.026773+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/pairing/paired-frontend-path.test.ts

## Purpose

Unit tests for `resolveFrontendPath`, verifying the three-tier resolution contract (shell env var → `.env` file → sibling default), empty-value semantics, relative-path handling, and that reading `.env` never mutates `process.env`.

## Key elements

- **`writeEnvironmentFile(contents)`** – writes a `.env` file into the per-test temp directory.
- **`sibling()`** – returns the expected default path (`workingDirectory/DEFAULT_FRONTEND_PATH`) for assertions.
- **`beforeEach` / `afterEach`** – creates a fresh `mkdtempSync` directory, mocks `process.cwd`, clears `FRONTEND_PATH` via `setProcessEnvironment`, then restores all jest mocks and removes the temp dir.
- **`describe('resolveFrontendPath')`** – seven `it` blocks covering:
  - Fallback to sibling when neither shell nor `.env` provides a value.
  - Reading `FRONTEND_PATH` from `.env` (the case `npm run` would miss).
  - Shell value taking priority over `.env`.
  - Whitespace-only shell value treated as unset → falls through to `.env`.
  - Empty `.env` declaration (e.g. `FRONTEND_PATH=` from `.env-example`) treated as unset → falls through to sibling.
  - Relative `.env` values resolved against the working directory.
  - `.env` contents not merged into `process.env` (no leakage).

## Relationships

- **`scripts/pairing/paired-frontend-path.ts`** – the system under test; imports `resolveFrontendPath` and `DEFAULT_FRONTEND_PATH`.
- **`tests/support/environment.ts`** – provides `setProcessEnvironment`, used to assign or clear `FRONTEND_PATH` on `process.env` in a test-safe way.

## Notes

- `process.cwd` is spied via `jest.spyOn`, so the tests depend on jest's mock infrastructure; running them outside a jest runner will throw.
- Every test executes in an isolated `os.tmpdir()` sub-directory, deliberately preventing the repository's own `.env` from influencing results.
- The header comment states this file mirrors `paired-backend-path.spec.ts` in the paired frontend repo—keep the two in sync when the resolution contract changes.
