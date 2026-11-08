---
source: src/modules/account/tests/contract/support.ts
sha256: 119c90a35bd528783deae250b52123a368bc5b87d87817630c1f9290b7d3848d
generated_at: 2026-11-08T04:33:05.066594+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/contract/support.ts

## Purpose

Shared setup helpers for the four account contract test suites. Provides a single login path that yields both credentials (bearer token **and** session cookie), plus small extractors for reading the bearer and `amr` claim, all working transparently across the `jwt` and `cookie` session modes.

## Key elements

- **`loginWithCookie(overrides?)`** — Creates a user via `createUser`, POSTs to `/account/login`, pulls the `__Host-session` cookie out of the response, and returns `{ user, bearer, jwtCookie }`. The `bearer` is the `token` field in `jwt` mode or the cookie value (`ses_…`) in `cookie` mode. Throws if login fails or no session cookie is set.
- **`bearerIn(response)`** — Extracts the `Bearer …` string from a login / re-proof / password-change response body (`body.token` or `body.sessionToken`).
- **`claimedAmr(response, userId)`** — Returns the `amr` claim the response's session recorded. In `jwt` mode it decodes the access token via `jose`; in `cookie` mode it reads the newest row from `sessionRowsOf(userId)`.

## Relationships

- **`tests/support/http.ts`** — uses `api()` to issue the login request.
- **`tests/support/cookies.ts`** — uses `setCookie` to grab the `__Host-session` cookie and `cookieValue` to read its value.
- **`src/modules/users/tests/factories.ts`** — calls `createUser` and uses `PLAIN_PASSWORD`.
- **`src/modules/account/session/config.ts`** — calls `getSessionMode()` to branch jwt vs. cookie logic.
- **`src/modules/account/tests/factories.ts`** — calls `sessionRowsOf(userId)` for the cookie-mode AMR lookup.
- **`jose`** — `decodeJwt` to read the `amr` claim in jwt mode.
- **Consumers**: `api.contract.test.ts`, `oauth.contract.test.ts`, `reauth.contract.test.ts`, `shop.contract.test.ts` all import these helpers for their setup and assertions.

## Notes

- The file intentionally returns **both** the bearer and the cookie. The cookie is what `current`, logout, and refresh endpoints depend on; `authenticateAs` (elsewhere) drops it, so tests that need those endpoints must use `loginWithCookie`.
- In `cookie` mode the "bearer" is the opaque `ses_…` session id, not a JWT—`Authorization: Bearer ses_…` is accepted the same way as the cookie header.
- `claimedAmr` has a hard mode split: the claim is embedded in the token (jwt) versus stored only in the database (cookie). Tests that assert on AMR must call this helper rather than reading the token directly.
- The cookie name `__Host-session` is hardcoded here; if the cookie name changes in the server config, this file must be updated in tandem.
