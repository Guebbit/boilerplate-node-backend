---
source: src/modules/users/tests/integration/session-epoch-lifecycle.test.ts
sha256: 1f9a5fd062ea1c49f962ed594c253ba9b4e3171cf424a8391e35b87584e6bfa4
generated_at: 2026-10-29T06:23:15.971950+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/session-epoch-lifecycle.test.ts

## Purpose

Integration tests verifying that an admin deactivating or soft-deleting an account advances its session epoch so that previously issued tokens remain invalid after a subsequent reactivation or restore (ASVS V7.4.2). Without the epoch, clearing `active` or `deletedAt` alone would resurrect every old token. All assertions are driven over HTTP.

## Key elements

- **`PAST_THE_SECOND_MS` (1100 ms)** – sleep duration chosen so the clock crosses into the next whole second; epoch and token `auth_time` are compared in whole-second units.
- **`nextSecond()`** – resolves after `PAST_THE_SECOND_MS`, ensuring the next assertion observes a strictly later second.
- **`loginAs(email)`** – POSTs `/account/login` with `PLAIN_PASSWORD`, returns the resulting `Bearer <token>` header value.
- **`statusWith(bearer)`** – GETs `/account` with the given bearer; returns `200` if the token is still valid, `401` if not.
- **`describe('deactivating an account')`** – three cases: old tokens stay dead after re-activation; owner can obtain a fresh login post-reactivation; a routine `PUT /users/:id` edit does *not* advance the epoch.
- **`describe('soft-deleting an account')`** – one case: old tokens stay dead after `DELETE` + `POST /users/:id/restore`.

## Relationships

- **`tests/support/http.ts`** – provides `api()` (supertest wrapper) and `authenticateAs('admin')`; every request in this file goes through them.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` runs once at module load to isolate the database per test run.
- **`src/modules/users/tests/factories.ts`** – supplies `createUser` (seeds a verified customer row) and `PLAIN_PASSWORD` (the known password for the login step).
- **`src/modules/account/tests/unit/family-liveness.test.ts`** – sibling test in the account module that exercises related account-state transitions; together they cover the epoch/liveness contract from both the users and account sides.

## Notes

- The 1100 ms sleep is not arbitrary padding: because epoch and `auth_time` are integer seconds, asserting before the boundary is crossed produces a false pass. Every test that expects `401` calls `nextSecond()` *before* the admin action, and the reactivation/restore test calls it *after* to let the new epoch register.
- The "ordinary edit" test (`PUT /users/:id`) is a deliberate negative case: it confirms the epoch only advances on deactivation and soft-delete, not on arbitrary profile changes.
- Tests are fully HTTP-driven (no direct service/function calls), so they exercise the real middleware chain including token validation.
