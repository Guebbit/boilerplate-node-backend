---
source: src/modules/account/tests/integration/delete-account.test.ts
sha256: 07b8383eeada542226f5d7e1e052194f05e8abf2d8c3aa0682c5e982afb5d1e4
generated_at: 2026-10-14T09:08:36.252218+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/delete-account.test.ts

## Purpose

Integration tests for the two-step account deletion HTTP flow (`DELETE /account` and `DELETE /account/delete-confirm`), driven through the real Express app. The primary property under test is enumeration prevention: a missing account and a successful mail-both must produce an identical `200` response so an attacker cannot distinguish them. The file deliberately avoids mocking the controller, routing, or auth middleware — only the mailer and one `userService.findByEmail` call are stubbed.

## Key elements

- **`mockOutbox`** — module-level array that records every `enqueueEmail` call (template + data), reset in `beforeEach`. Captured via a `jest.mock` of `@infrastructure/adapters/mailer`.
- **`jest.mock('@modules/users')`** — spreads the real module, overriding only `userService.findByEmail` with a `jest.fn` that delegates to the real implementation by default. This is the single seam used to simulate a lookup miss for the enumeration-prevention test.
- **`mockFindByEmail`** — typed reference to the above mock; the only call-site that is ever overridden (`mockResolvedValueOnce(undefined)`).
- **`authenticate()`** — helper that creates a user via the users test factory, logs in through `POST /account/login`, and returns `{ user, bearer }` ready for `requireFreshAuth(CRITICAL)`-gated routes.
- **`describe('DELETE /account')`** — three cases: 401 without session; 200 + one `account.delete-request` mail on success; 200 + zero mail when `findByEmail` returns `undefined` (enumeration prevention).
- **`describe('DELETE /account/delete-confirm')`** — two cases: a valid planted token hard-deletes the row, clears `__Host-session`/`isAuth` cookies, and returns 200; an unknown token returns 422 and leaves the account intact.

## Relationships

- **`tests/support/http.ts`** — provides the `api()` supertest wrapper used for every request.
- **`tests/support/setup-test-db.ts`** — called once at module level (`setupTestDb()`) to provision an in-memory DB for the real repositories.
- **`src/modules/users/tests/factories.ts`** — supplies `createUser`, `PLAIN_PASSWORD`, and `userRepository` (used in assertions to verify the row was/wasn't deleted).
- **`src/modules/users/index.ts`** / **`src/modules/users/services/index.ts`** — the real `userService` is re-exported here; the test mocks only its `findByEmail` method while keeping all other methods (and `session/resolver`'s per-request `getAuth` read) live.
- **`src/modules/account/services/index.ts`** — source of the `ACCOUNT_DELETE_TOKEN_TYPE` constant used when planting a confirm token.
- **`src/modules/account/tests/factories.ts`** — provides `plantToken`, which inserts a token row directly into the DB for the confirm-endpoint tests.
- **`src/modules/users/repository.ts`** — reached indirectly via `userRepository` from the users factories; used in post-condition assertions (`findById`).

## Notes

- The `mock*` naming on `mockOutbox` is not stylistic: `jest.mock` factories are hoisted above imports and may only reference identifiers prefixed with `mock` (Jest runtime constraint).
- `findByEmail` is mocked rather than `getAuth`/`findById` because the auth resolver re-reads the caller by ID on every request; a truly deleted row would 401 before the controller ever runs. The narrowest realistic race (concurrent delete between the resolver's read and the controller's own lookup) is what the single `mockResolvedValueOnce(undefined)` simulates.
- Cookie-clearing mechanics (flags, expiry) are asserted to *exist* here but are unit-tested in `cookies.test.ts`; this file only checks the confirm route reaches them.
- Audit logging, analytics, and token-issuance behaviour of `requestAccountDeletion`/`removeOwnAccount` belong to `self-service.test.ts`; mail body content belongs to `emails.test.ts`. Do not add those assertions here.
