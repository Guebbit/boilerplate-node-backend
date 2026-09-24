---
source: tests/unit/scripts/db/run-script.test.ts
sha256: c9ea2adca7924d7115fd2cfdf101e8aacd063558f4bead5b86a79491c3d5207e
generated_at: 2026-09-23T20:30:04.545596+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/db/run-script.test.ts

## Purpose
Unit tests for the `runScript` wrapper, verifying its three contract guarantees: the body runs before cleanup, the process exit code is set to 1 on failure, and the failure reason is logged. A dedicated test also confirms cleanup still executes when the body throws — the scenario that previously hung `scenario:apply` by leaving Mongo/Redis sockets open.

## Key elements
- **`describe('runScript', …)`** — seven test cases covering: happy-path ordering, body-throw exit code + log, cleanup-on-throw, no-rejection guarantee, cleanup-failure-doesn't-poison-success, both-fail verdict, and non-Error rejection handling.
- **`jest.mock('@infrastructure/adapters/logger', …)`** — inline factory mock replacing the shared logger with `jest.fn()` stubs (`info`, `warn`, `error`, `debug`).
- **`ORIGINAL_EXIT_CODE` / `afterEach`** — snapshots and restores `process.exitCode` around every test so tests don't leak state.

## Relationships
- **`scripts/db/run-script.ts`** — the module under test; the file imports and exercises its single export `runScript(body, cleanup)`.
- **`src/infrastructure/adapters/logger.ts`** — mocked at the module boundary via `jest.mock`; tests assert on `logger.error` (failure path) and `logger.warn` (cleanup-failure path) call shapes.

## Notes
- The `jest.mock` factory is defined inline rather than closing over a module-level `const` because Jest hoists the mock above the import statements; a factory reading an outer `const` would hit a TDZ error.
- Tests intentionally avoid calling `process.exit` — `runScript` signals failure only through `process.exitCode = 1`, which the tests assert directly.
- The "non-Error throw" test rejects with a bare string; an ESLint suppression comment is required because `@typescript-eslint/prefer-promise-reject-errors` would otherwise flag the intentional case.
- `runScript` is expected to **never** reject its returned promise — the "never rejects" test locks that in so callers can `await` without their own `.catch`.
