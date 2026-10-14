---
source: src/modules/account/tests/contract/support.ts
sha256: eb18f584a7c03edb83360f5049fee1c740d190d8a5fc65316192945c6827b70f
generated_at: 2026-10-14T09:05:59.578280+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/contract/support.ts

## Purpose

Shared setup helpers for the account contract test suites. Abstracts away the dual-session-mode (`jwt` / `cookie`) branching so individual contract tests can log in, extract a bearer credential, and inspect AMR claims without repeating mode-specific logic.

## Key elements

- **`loginWithCookie(overrides?)`** — Creates a user, POSTs to `/account/login`, and returns `{ user, bearer, jwtCookie }`. The bearer is the access token in `jwt` mode or the `ses_…` session id in `cookie` mode. Throws if login fails or no `__Host-session` cookie is set.
- **`bearerIn(response)`** — Builds a `Bearer …` string from a login / re-proof / password-change response body. Prefers `data.token`, falls back to `data.sessionToken`.
- **`claimedAmr(response, userId)`** — Returns the `amr` claim array the session recorded. In `jwt` mode decodes the token; in `cookie` mode reads the newest row from `sessionRowsOf(userId)`.

## Relationships

- **`tests/support/http.ts`** — Source of the `api()` HTTP client used for the login POST.
- **`tests/support/cookies.ts`** — Provides `setCookie` / `cookieValue` to extract the `__Host-session` cookie from the response.
- **`src/modules/users/tests/factories.ts`** — Provides `createUser` and `PLAIN_PASSWORD` used by `loginWithCookie`.
- **`src/modules/account/session/config.ts`** — `getSessionMode()` drives the `jwt` vs `cookie` branching inside `claimedAmr`.
- **`src/modules/account/tests/factories.ts`** — `sessionRowsOf(userId)` supplies the database rows that `claimedAmr` reads in `cookie` mode.
- **`api.contract.test.ts`, `oauth.contract.test.ts`, `reauth.contract.test.ts`, `shop.contract.test.ts`** — The contract suites that import these helpers for their shared login and assertion setup.

## Notes

- The `__Host-session` cookie name is hardcoded; if the session cookie name changes, `loginWithCookie` must be updated.
- In `cookie` mode the "bearer" is the opaque `ses_…` id, not a JWT — tests must not attempt to decode it.
- `claimedAmr` in `cookie` mode is **async** (DB read) while in `jwt` mode it is effectively synchronous (local decode); callers must always `await`.
- The bearer fallback in `loginWithCookie` (`token ?? cookieValue(jwtCookie)`) means the returned bearer may come from the cookie body rather than `response.body.data.token`.
