---
source: src/modules/users/tests/integration/session-epoch-lifecycle.test.ts
sha256: 1f9a5fd062ea1c49f962ed594c253ba9b4e3171cf424a8391e35b87584e6bfa4
generated_at: 2026-11-08T08:57:24.865747+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/session-epoch-lifecycle.test.ts

## Purpose

Integration tests verifying that the session-epoch mechanism keeps tokens invalid after an account is deactivated-then-reactivated or soft-deleted-then-restored (ASVS V7.4.2). Without the epoch bump, clearing `active` or `deletedAt` alone would silently revive every previously-issued token. Tests are driven end-to-end over HTTP: an admin performs the state change, then the original token holder's next request must be rejected.

## Key elements

- **`PAST_THE_SECOND_MS`** (1100 ms) — delay that guarantees the token's `auth_time` falls in an earlier whole-second bucket than the new epoch.
- **`nextSecond()`** — sleeps past the next whole-second boundary so epoch-vs-`auth_time` comparisons resolve correctly.
- **`loginAs(email)`** — POSTs `/account/login` and returns the `Bearer <token>` header value.
- **`statusWith(bearer)`** — GETs `/account` with the given bearer; returns 200 if the token is still live, 401 if not.
- **`describe('deactivating an account')`** — three cases: tokens stay dead after reactivation; owner can sign in fresh after reactivation; an ordinary `PUT /users/:id` edit does *not* invalidate sessions (negative control).
- **`describe('soft-deleting an account')`** — one case: tokens stay dead after `DELETE` then `POST /restore`.

## Relationships

- **`tests/support/setup-test-db.ts`** — calls `setupTestDb()` to provision and reset a per-suite database.
- **`tests/support/http.ts`** — supplies `api()` (supertest-style HTTP client) and `authenticateAs('admin')` (returns a pre-authed admin bearer).
- **`src/modules/users/tests/factories.ts`** — provides `createUser()` to build target accounts and `PLAIN_PASSWORD` for the login step.

## Notes

- **Timing is load-bearing.** Epoch and `auth_time` are compared in *whole seconds*; without `await nextSecond()` before the state-change request, a token issued in the same second as the epoch bump could still appear valid, making the test flaky.
- **Negative control matters.** The "ordinary edit" test exists specifically to guard against over-broad epoch bumps (e.g., a blanket "update user → bump epoch" shortcut in the service layer).
- **Graph neighbor `src/modules/account/tests/unit/family-liveness.test.ts`** appears in the dependency graph but is not imported or referenced here; no direct interaction.
