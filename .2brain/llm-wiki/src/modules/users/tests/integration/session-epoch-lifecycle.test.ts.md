---
source: src/modules/users/tests/integration/session-epoch-lifecycle.test.ts
sha256: 8c6e39edba5d91c615c1c210a766f0bd18d24afc488fe8d3889021ee708029d6
generated_at: 2026-10-15T12:15:40.444880+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/session-epoch-lifecycle.test.ts

## Purpose

Integration tests (driven over HTTP) that verify the session-epoch mechanism: when an admin deactivates or soft-deletes an account, the epoch advances so that tokens the account previously held remain rejected (401) even after the account is reactivated or restored. Without the epoch, clearing `active` or `deletedAt` alone would silently revive every old token. The tests enforce ASVS V7.4.2 compliance.

## Key elements

- **`PAST_THE_SECOND_MS` (1100 ms)** — constant used to guarantee the test crosses a whole-second boundary, because the epoch and a token's `auth_time` are compared in whole seconds.
- **`nextSecond()`** — helper that sleeps just past the next second boundary before the assertion that depends on epoch comparison.
- **`loginAs(email)`** — posts to `/account/login` and returns the `Bearer <token>` header value.
- **`statusWith(bearer)`** — performs `GET /account` with the given bearer; returns the HTTP status (200 = live token, 401 = rejected).
- **`describe('deactivating an account')`** — three tests:
  - tokens held before deactivation stay dead after reactivation;
  - the owner can sign in fresh after reactivation;
  - a rename that leaves the account active does **not** end existing sessions.
- **`describe('soft-deleting an account')`** — one test: tokens held before deletion stay dead after restore.

## Relationships

- **`tests/support/http.ts`** — supplies `api()` (the HTTP client) and `authenticateAs('admin')` used in every test.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module scope to provision a clean database per test run.
- **`src/modules/users/tests/factories.ts`** — `createUser` builds a verified customer account; `PLAIN_PASSWORD` is the known password for the `loginAs` helper.

## Notes

- The `nextSecond()` sleep is **load-bearing**: without crossing a whole-second boundary the epoch and `auth_time` may compare as equal and the old token would still pass. Omitting it causes a flaky or false-passing test.
- Tests exercise the full HTTP stack (routing, auth middleware, service layer, DB), so they catch regressions at any level, not just the epoch-bump logic.
- The "rename leaves active" test is a negative guard: the epoch must **not** advance on a no-op deactivation.
