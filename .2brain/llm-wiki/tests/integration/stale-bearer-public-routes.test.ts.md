---
source: tests/integration/stale-bearer-public-routes.test.ts
sha256: d4d05a76d706abca18b64891b7c31069a02e4ee278dbd5cd3022a75873a3c0b9
generated_at: 2026-11-08T09:49:19.649027+00:00
model: ollama:qwen3.8:27b
---

# tests/integration/stale-bearer-public-routes.test.ts

## Purpose

Integration tests verifying that a bearer token whose session has been dropped is refused with **401 `Bearer error="invalid_token"`** (RFC 6750 §3.1) on routes that are also open to unauthenticated guests. The guard ensures the client can detect the stale token and refresh, rather than the server silently answering as a guest and the session never registering activity.

## Key elements

- **`describe('a revoked bearer on GET /products/:id')`** – Three cases: revoked bearer → 401, no bearer → 200 (guest), valid bearer → 200 (authenticated read).
- **`CONTACT_PAYLOAD`** (module-level const) – A valid contact-message body (`name`, `email`, `subject`, `message`) reused across the `POST /tasks` cases.
- **`describe('POST /tasks, which accepts a sign-in without requiring one')`** – Revoked bearer → 401 *and* the Altcha challenge is **not** consumed (same challenge succeeds on the token-less retry); valid bearer → 202 with `subjectId` set to the user; no bearer → 202 with `subjectId` undefined.
- **`describe('POST /analytics/events')`** – Revoked bearer → 401; no bearer → 204.

## Relationships

| Neighbor | Interaction |
|---|---|
| `tests/support/http.ts` | Provides `api()` (request helper) and `authenticateAs('user')` (creates a user, returns bearer). |
| `tests/support/setup-test-db.ts` | `setupTestDb()` resets the database once at module load. |
| `tests/support/altcha.ts` | `useAltcha()` enables the challenge middleware per suite; `solvedChallenge()` returns a valid one-use Altcha header. |
| `src/modules/account/tests/factories.ts` | `dropAllSessions(user.id)` revokes every session for the test user, producing the "stale bearer" condition. |
| `src/modules/products/tests/factories.ts` | `createProduct({ title, active })` seeds the product looked up by `GET /products/:id`. |
| `src/modules/tasks/tests/factories.ts` | `findAllTasks()` asserts persistence and `subjectId` attribution after `POST /tasks`. |

## Notes

- **Altcha is single-use.** The first `POST /tasks` case deliberately reuses the *same* solved challenge on the retry request to prove the 401 path does not consume it.
- `setupTestDb()` is called once at the top level (not inside `beforeEach`), relying on per-test fixture isolation from the factories.
- The file explicitly scopes out the *idle-timeout* reason for token invalidation, noting it is covered in `account`'s own test suite.
- All three routes are **public** (readable/submittable without auth); the test's concern is purely the *presence of a dead token*, not authorization per se.
