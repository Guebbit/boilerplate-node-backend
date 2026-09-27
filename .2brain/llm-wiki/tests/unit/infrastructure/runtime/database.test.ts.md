---
source: tests/unit/infrastructure/runtime/database.test.ts
sha256: 0593869574f13320ded08421e20e8210c4a8af103b936b524ae1ec8efd575602
generated_at: 2026-09-27T16:09:53.136868+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/infrastructure/runtime/database.test.ts

## Purpose

Unit tests for the database connection layer, verifying two concerns: which MongoDB connect errors are classified as permanent (no retry) versus transient (retry), and that the `start` boot routine guards against accidental index builds in production.

## Key elements

- **`describe('isPermanentConnectError')`** — asserts that `MongoParseError`, `MongoInvalidArgumentError`, and `MongoServerError` (code 18) are treated as permanent (give up immediately), while `MongoServerSelectionError` is not (keep retrying).
- **`describe('start')`** — verifies that when `mongoose.connect` rejects with a permanent error, `start()` rejects with a "not retrying" message after exactly one attempt.
- **`describe('autoIndex (B22)')`** — confirms that in `NODE_ENV=production`, `mongoose.set('autoIndex', false)` is called before `mongoose.connect` resolves; in `NODE_ENV=development`, `autoIndex` is never explicitly set. Saves and restores `process.env.NODE_ENV` in `afterEach`.

## Relationships

- **Imports** `isPermanentConnectError` and `start` from `src/infrastructure/runtime/database.ts` — the module under test.
- **Imports** `mongoose` from the `mongoose` package to spy on `connect` and `set` during the `start` tests.

## Notes

- The `autoIndex` test spies on `mongoose.set` but asserts inside the `mongoose.connect` mock callback — i.e., it checks the guard at the moment a connection is actually established, not just before the call is initiated. This matters because multiple processes (reaper, sweep) share the same `start` path rather than going through `createApp()`'s `boot`.
- The `autoIndex` block explicitly notes it is tracked as **B22**, an internal ticket/reference for the regression it guards.
- `NODE_ENV` is mutated directly and restored in `afterEach`; no Jest fake-timer or module-reset machinery is used.
