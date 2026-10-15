---
source: tests/unit/scenarios/ephemeral-mongo.test.ts
sha256: 5bc6f09a64f8a395141838175050915bcac0ffe719d80709a5af64fe222e13c3
generated_at: 2026-10-15T13:24:02.960642+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scenarios/ephemeral-mongo.test.ts

## Purpose

Unit tests for the `startEphemeralMongo` three-way resolver: an external `NODE_TEST_MONGO_URI` wins outright, a pre-installed `mongod` binary short-circuits the download, and only then does the caller's `startInProcess` boot. The in-process path is always a `jest.fn()` mock—no real `mongodb-memory-server` is started here.

## Key elements

- **`startInProcess`** (`jest.fn()`) — resolves a stub `EphemeralMongo` (`uri: 'mongodb://127.0.0.1:1/ephemeral'`, no-op `stop`). Stands in for the real boot so the tests exercise only the resolver logic.
- **`CLEARED_ENV_KEYS`** — `MONGOMS_SYSTEM_BINARY_VERSION_CHECK` and `MONGOMS_MD5_CHECK`. These are derived bookkeeping set by `usePreinstalledBinary`; they are unconditionally wiped in `beforeEach` (not saved/restored) to avoid polluting later cases.
- **`beforeEach`** — calls `setProcessEnvironment` to set both skip-download vars to `undefined`, giving every case a clean slate regardless of run order.
- **`afterEach`** — `startInProcess.mockClear()`.
- **`describe('startEphemeralMongo')`** — five cases:
  1. External URI is used and `startInProcess` is never called.
  2. `stop()` resolves `undefined` on the external-URI path.
  3. A real (empty) binary on disk causes both skip-download vars to be set to `'false'` before `startInProcess` is invoked once.
  4. A non-existent binary path leaves both skip-download vars `undefined`.
  5. An explicit `dbPath` option is forwarded as the sole argument to `startInProcess`.

## Relationships

- **`scenarios/support/ephemeral-mongo.ts`** — the system under test. Provides `startEphemeralMongo` and the `EphemeralMongo` type that this file imports and exercises.
- **`tests/support/environment.ts`** — provides `setProcessEnvironment`, the helper used to set and clear `process.env` values deterministically in every test case.

## Notes

- The `beforeEach` **clears** the skip-download keys rather than restoring a saved "original." This is intentional: `globalSetup` runs in the same worker process and may have already set them to `'false'` for the shared real Mongo; capturing that value as the baseline would leak into subsequent cases.
- Tests are written to be **order-independent**—any single case can be run in isolation (e.g. via `enableFindRelatedTests`) because `beforeEach` establishes the preconditions unconditionally.
- The pre-installed-binary case creates a temporary directory with an empty file named `mongod` to satisfy the existence check, then removes it in a `finally` block.
