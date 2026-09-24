---
source: tests/unit/scenarios/ephemeral-mongo.test.ts
sha256: 7c434a10716c94d816278fcc19630a8c3506cfe3d7f526c395937718f22deee0
generated_at: 2026-09-23T20:29:15.618254+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scenarios/ephemeral-mongo.test.ts

## Purpose

Unit tests for the `startEphemeralMongo` three-way resolver. Verifies the priority chain (external URI → pre-installed binary → in-process boot) using a mocked `startInProcess`, so no real `mongodb-memory-server` is ever launched.

## Key elements

- **`startInProcess`** — a `jest.fn()` that resolves a fake `{ uri, stop }` object; stands in for a real in-process Mongo boot.
- **`RESTORED_ENV_KEYS`** — `NODE_TEST_MONGO_URI`, `MONGOMS_SYSTEM_BINARY`. Captured into `ORIGINAL` at module load and restored in `afterEach` so tests are order-independent.
- **`CLEARED_ENV_KEYS`** — `MONGOMS_SYSTEM_BINARY_VERSION_CHECK`, `MONGOMS_MD5_CHECK`. Derived bookkeeping written by `usePreinstalledBinary`; always _deleted_ (never restored) because `globalSetup` may have set them in the parent process before this worker started.
- **`beforeEach` / `afterEach`** — guarantee a clean env slate and mock reset regardless of run order (supports `enableFindRelatedTests` running any single case in isolation).
- **`describe('startEphemeralMongo')`** — five cases:
    1. External URI short-circuits; `startInProcess` never called.
    2. `stop()` on the external path is a no-op.
    3. A real binary path on disk causes the two skip-download vars to be set to `'false'` before `startInProcess` is invoked.
    4. A non-existent binary path leaves the skip-download vars `undefined`.
    5. A caller-supplied `dbPath` is forwarded verbatim to `startInProcess`.

## Relationships

- **`scenarios/support/ephemeral-mongo.ts`** — the module under test. This file imports `startEphemeralMongo` and the `EphemeralMongo` type from it; every assertion in this test file validates that module's decision logic.

## Notes

- `startInProcess` is intentionally a mock. The real in-process boot is exercised in integration suites (referenced in the header comment as `scenarios/support/ephemeral-mongod.ts` / `tests/integration/app-health.test.ts`), so this file must not accidentally boot a server.
- The distinction between _restored_ vs. _cleared_ env keys matters: the `CLEARED_ENV_KEYS` are set by `usePreinstalledBinary` inside `globalSetup` in the parent process. Treating them as "original" and restoring them would leak `'false'` into subsequent test cases that legitimately need the default `true`/unset behaviour.
- The binary-existence test creates a real temp directory and file (`mkdtempSync` + `writeFileSync`), then removes it in a `finally` block — it does not depend on any fixture or setup file.
