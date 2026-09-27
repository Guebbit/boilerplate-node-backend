---
source: src/modules/account/tests/integration/delete-account.test.ts
sha256: 0d7212fd4515834be3a4206e28f3ef20265c36aeabe5e68ed9f08733f52633b0
generated_at: 2026-09-27T14:34:27.232842+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/integration/delete-account.test.ts

## Purpose

Integration test for the two-step account-deletion HTTP flow: `DELETE /account` (request) and `DELETE /account/delete-confirm` (spend). Drives the real Express app to verify the status codes a caller actually receives and that the enumeration-prevention invariant holds — a missing account and a successful mail-send return the identical `200`.

## Key elements

- **`mockOutbox`** – Array that captures every `enqueueEmail` call (template + data). Reset in `beforeEach`.
- **`jest.mock('@infrastructure/adapters/mailer')`** – Replaces `enqueueEmail` with a spy that pushes into `mockOutbox`; all other mailer exports remain real.
- **`jest.mock('@modules/users')`** – Partially mocks `userService.findByEmail` (delegating to the real fn by default) so a single test can force a lookup miss.
- **`mockFindByEmail`** – Typed `jest.MockedFunction` handle on the mocked `findByEmail` for `mockResolvedValueOnce`.
- **`setupTestDb()`** – Spins up a real database for the suite.
- **`authenticate()`** – Creates a user, logs in via `POST /account/login`, returns `{ user, bearer }`.
- **`describe('DELETE /account')`** – Asserts 401 without a session; 200 + one `account.delete-request` mail on success; 200 + no mail when `findByEmail` returns `undefined`.
- **`describe('DELETE /account/delete-confirm')`** – Asserts 200 + row removed + `Set-Cookie` clears (`jwt`, `isAuth`) on a valid token; 422 + row intact on an unissued token.

## Relationships

| Neighbor | Interaction |
|---|---|
| `tests/support/http.ts` | Provides `api()` — the HTTP client used for every request. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` initialises the shared test database. |
| `src/modules/users/tests/factories.ts` | Supplies `createUser`, `PLAIN_PASSWORD`, and `userRepository` (for post-assertions like `findById`). |
| `src/modules/users/index.ts` | Re-exports `userService`; the file partially mocks it to intercept `findByEmail`. |
| `src/modules/users/service.ts` | The real `findByEmail` implementation that the mock delegates to by default. |
| `src/modules/users/repository.ts` | `userRepository.findById` is used to verify (or deny) hard-delete. |
| `src/modules/account/services/index.ts` | Exports `ACCOUNT_DELETE_TOKEN_TYPE`, used to seed a valid confirm token. |

## Notes

- **`mock*` prefix is load-bearing.** `jest.mock` is hoisted above `import` statements, so the factory can only close over identifiers whose names start with `mock`. Renaming `mockOutbox` without that prefix will break the mock.
- **Why mock `findByEmail` at all?** A genuinely deleted account would 401 inside `getAuth` (session resolver re-reads by ID) before the controller ever runs, making the "account vanished between auth and handler" branch unreachable black-box. `findByEmail` is the narrowest seam; routing, `isAuth`, and response shaping still execute for real.
- **Cookie-clear mechanics** (flag values, expiry) are covered by `cookies.test.ts`; this file only asserts the confirm route reaches them (`Set-Cookie` contains `jwt=` and `isAuth=`).
- **Scope boundary:** mail *content* belongs to `emails.test.ts`; audit/analytics/token-issuance side-effects belong to `self-service.test.ts`. This file owns only the HTTP contract (status, mail *sent-or-not*, row existence, token spend).
