---
source: src/modules/account/tests/contract/session-view.contract.test.ts
sha256: 2ddc304b8ad15d9341fe2465b536c9c5ed711861fbc8a528d6b7bb5864e9ee5a
generated_at: 2026-11-14T19:00:38.930024+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/contract/session-view.contract.test.ts

## Purpose

Contract test asserting that session-endpoint responses (sign-in, token refresh) carry the same `abilities` object that `GET /account` would publish, so a client never needs a follow-up read after authenticating. One test per "door," one rule set regardless of transport mode.

## Key elements

- **`signIn(email)`** – local helper that calls `api().post('/account/login')` with a plain password and expects 200.
- **`describe('a password sign-in')`** – three tests:
  - Sign-in response includes the full account view (`id`, `email`, `abilities.tenant`, `activity.lastActiveAt`) and excludes `abilities.subjects`.
  - The `abilities` in the sign-in body is **deep-equal** to the `abilities` returned by a subsequent `GET /account` (using whichever credential the response provided: bearer token or cookie).
  - A wrong password yields 401 with no `account` key in the body.
- **`describe('a token refresh')`** – one test:
  - In **jwt** mode, `api().post('/account/refresh')` (cookie credential) returns 200 and the same abilities as sign-in.
  - In **cookie** mode (no refresh concept), the same request returns 404 and no abilities.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/account/session/config.ts` | Imports `getSessionMode()` to branch the refresh assertion on `cookie` vs `jwt`. |
| `src/modules/users/tests/factories.ts` | Imports `createUser` and `PLAIN_PASSWORD` to seed a known user per test. |
| `tests/support/contract.ts` | Side-effect import; establishes contract-test conventions (matchers, globals). |
| `tests/support/cookies.ts` | Imports `cookieHeader` to pull the `__Host-session` cookie from a response for authenticated follow-up requests. |
| `tests/support/http.ts` | Imports `api()` – the shared supertest-style HTTP client used for every request. |
| `tests/support/setup-test-db.ts` | Calls `setupTestDb()` once at module scope to prepare a clean database. |

## Notes

- The credential used for the follow-up `GET /account` depends on runtime mode: if `login.body.token` is a string the test sends `Authorization: Bearer …`; otherwise it sends the `__Host-session` cookie. Tests must not assume one mode.
- `abilities.subjects` is explicitly asserted **absent** from the session view—this is an intentional omission, not a bug.
- The refresh test is the only one whose expected status is mode-dependent (200 vs 404); all other assertions are mode-agnostic.
- The cookie name is hard-coded as `__Host-session`; if the session cookie name changes, the refresh and follow-up-read tests will break silently (they'll just fail to authenticate).
