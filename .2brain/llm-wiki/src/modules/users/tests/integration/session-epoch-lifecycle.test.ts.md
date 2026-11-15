---
source: src/modules/users/tests/integration/session-epoch-lifecycle.test.ts
sha256: aae4603f5d5c711e95cc77196100a530de3fa6d9b35087c7f73e3b331107d992
generated_at: 2026-11-14T22:39:03.036469+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/session-epoch-lifecycle.test.ts

## Purpose

Integration test verifying that moving an account's session epoch (via deactivate/reactivate or soft-delete/restore) permanently invalidates previously issued tokens, while ordinary profile edits do not. Closes the gap where clearing `active` or `deletedAt` alone would resurrect all old tokens (ASVS V7.4.2). Tests are driven entirely over HTTP.

## Key elements

- **`nextSecond()`** — sleeps ≥ 1 s so the epoch and a token's `auth_time` compare as different whole-second values; a prerequisite before asserting invalidation.
- **`loginAs(email)`** — performs `POST /account/login` and returns the resulting `Bearer <token>` header value.
- **`statusWith(bearer)`** — calls `GET /account` with a given bearer; resolves 200 (live) or 401 (invalid).
- **`describe('deactivating an account')`** — three cases: tokens stay dead after reactivate; owner can log in fresh after reactivate; a `PUT /users/:id` rename does *not* invalidate existing tokens.
- **`describe('soft-deleting an account')`** — one case: tokens stay dead after `api().delete(...)` + `POST .../restore`.

## Relationships

- **`tests/support/http.ts`** — provides the `api()` supertest instance and `authenticateAs()` (admin bearer) used throughout.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` runs at module load to (re)create a clean database before the suite executes.
- **`src/modules/users/tests/factories.ts`** — supplies `createUser()` to spin up a verified customer account and `PLAIN_PASSWORD` for login assertions.

## Notes

- **Whole-second granularity**: the server compares `epoch` and `auth_time` at second resolution. Forgetting `nextSecond()` between login and the deactivate/restore call makes the 401 assertion flaky or fail, because the token's `auth_time` still equals the epoch.
- **Admin vs. target separation**: the admin bearer (from `authenticateAs`) and the target's bearer (from `loginAs`) are intentionally distinct; the "owner signs in again" test confirms the *new* token is accepted while the *old* one is not.
- **Module docblock is the spec**: the `@module` JSDoc at the top states the threat model and why the epoch exists; it reads as a mini-requirement, not just a comment.
