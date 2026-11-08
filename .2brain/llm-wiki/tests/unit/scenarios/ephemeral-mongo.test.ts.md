---
source: tests/unit/scenarios/ephemeral-mongo.test.ts
sha256: 5bc6f09a64f8a395141838175050915bcac0ffe719d80709a5af64fe222e13c3
generated_at: 2026-11-08T10:29:33.330486+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scenarios/ephemeral-mongo.test.ts

## Purpose

Unit tests for the `startEphemeralMongo` three-way resolver: external URI (`NODE_TEST_MONGO_URI`) → pre-installed binary (`MONGOMS_SYSTEM_BINARY`) → caller-supplied `startInProcess`. The `startInProcess` argument is always a `jest.fn()` mock; a real `mongodb-memory-server` boot is deliberately left to the integration suites.

## Key elements

- **`startInProcess`** (module-level `jest.fn()`) — returns a resolved fake `EphemeralMongo` (`uri` + no-op `stop`), standing in for the real in-process server.
- **`CLEARED_ENV_KEYS`** — `['MONGOMS_SYSTEM_BINARY_VERSION_CHECK', 'MONGOMS_MD5_CHECK']`, the two bookkeeping vars that `usePreinstalledBinary` derives. Always cleared in `beforeEach` rather than captured-and-restored, because `globalSetup` may have already set them in the parent process.
- **`beforeEach`** — writes `undefined` for both keys via `setProcessEnvironment`, guaranteeing a clean slate regardless of run order or isolated single-test invocation.
- **`afterEach`** — `startInProcess.mockClear()`.
- **Test cases** (5):
  - External URI short-circuits; `startInProcess` is never called.
  - `stop()` on the external path resolves to `undefined` (no-op).
  - A real temp file at `MONGOMS_SYSTEM_BINARY` triggers the skip-download vars to be set to `'false'` *before* `startInProcess` is invoked.
  - A non-existent path leaves both skip-download vars `undefined`.
  - A caller-supplied `dbPath` is passed through to `startInProcess`.

## Relationships

- **`scenarios/support/ephemeral-mongo.ts`** — source of `startEphemeralMongo` (the SUT) and the `EphemeralMongo` type.
- **`tests/support/environment.ts`** — provides `setProcessEnvironment`, the only way this file mutates `process.env`.

## Notes

- `startInProcess` is **never** a real boot here. A real `mongodb-memory-server` start belongs to integration tests (e.g. `tests/integration/app-health.test.ts`).
- The two `MONGOMS_*` check vars must be cleared unconditionally in `beforeEach` (not captured-then-restored) because `globalSetup` runs in the parent process and may have already set them to `'false'`; capturing that state as the "original" would silently leak into subsequent cases.
- The pre-installed-binary test creates a real zero-byte file in `os.tmpdir()` and removes it in a `finally` block; it does not rely on any fixture.
- The file is designed to be safe under `enableFindRelatedTests` single-case execution: no test assumes a prior test's `afterEach` ran first.
