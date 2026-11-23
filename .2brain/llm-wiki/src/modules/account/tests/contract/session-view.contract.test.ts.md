---
source: src/modules/account/tests/contract/session-view.contract.test.ts
source_sha256: 63a1ec13483f372d7c58dc35ead5faa125c56ad4c91137fcd4a16ae9b60145de
context_sha256: f900706281da38838ceaee5b57ac98ae1c7f0831b1005a5adee441e3ef7d2ab3
generated_at: 2026-11-22T03:51:11.553856+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/contract/session-view.contract.test.ts

## Purpose
Contract tests checking that session answers carry what a client would otherwise request next. A sign-in returns the account view (account, abilities, idle clock). A refresh returns the abilities. Each test asserts the same abilities that `GET /account` publishes, so there is one rule set however the client arrives at it.

## Key elements
- `signIn(email)`: helper that POSTs `/account/login` with the factory's `PLAIN_PASSWORD` and expects 200.
- `describe('a password sign-in')`:
  - The answer includes `account` (id, email), non-empty `abilities.tenant`, no `abilities.subjects`, and a string `activity.lastActiveAt`.
  - A staff (`editor`, verified) sign-in returns `idleTimeoutSeconds` 1800, `idleRemainingSeconds` 1800 and `lifetimeRemainingSeconds` 86,400.
  - A shopper's `activity` omits `idleRemainingSeconds` and `lifetimeRemainingSeconds`.
  - The login `abilities` equal the body of the follow-up `GET /account`.
  - A wrong password gives 401 with no `account` in the body.
- `describe('a token refresh')`: POSTs `/account/refresh` with the session cookie. It expects 200 with abilities matching the login's, or 404 in cookie mode.

## Relationships
- `src/modules/account/session/config.ts`: `getSessionMode()` decides whether the refresh test expects 404 (`cookie`) or 200.
- `src/modules/users/tests/factories.ts`: `createUser` seeds users (optionally with a role and `verifiedAt`), and `PLAIN_PASSWORD` is the login password.
- `tests/support/contract.ts`: imported for its side effects (`@tests/contract`).
- `tests/support/http.ts`: `api()` is the HTTP client for all requests.
- `tests/support/cookies.ts`: `cookieHeader(login, '__Host-session')` pulls the session cookie from a response.
- `tests/support/setup-test-db.ts`: `setupTestDb()` is called at module level to prepare the test database.

## Notes
- The test branches on session mode. In `jwt` mode, login returns `body.token` and the test sends it as a Bearer header. In `cookie` mode, the test uses the `__Host-session` cookie instead.
- The refresh test sends the cookie even in jwt mode, and a cookie deployment has no refresh endpoint (404).
- The 86,400 lifetime value is the config default (`NODE_SESSION_LIFETIME_STAFF`). It is whole because the session is new.
