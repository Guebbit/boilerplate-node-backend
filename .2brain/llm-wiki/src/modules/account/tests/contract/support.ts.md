---
source: src/modules/account/tests/contract/support.ts
sha256: 119c90a35bd528783deae250b52123a368bc5b87d87817630c1f9290b7d3848d
generated_at: 2026-10-29T02:52:42.471998+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/contract/support.ts

## Purpose

Shared setup helpers for the account contract test suites. Provides mode-agnostic login, token extraction, and `amr`-claim inspection so that `api`, `oauth`, `reauth`, and `shop` contract tests can authenticate and assert session state without duplicating session-mode logic.

## Key elements

- **`loginWithCookie(overrides?)`** — Creates a user (via `createUser`), POSTs `/account/login`, and returns `{ user, bearer, jwtCookie }`. The `bearer` string is the access token in `jwt` mode or the `ses_…` session id in `cookie` mode, always prefixed with `Bearer `. Throws if the response is non-200 or no `__Host-session` cookie is set.
- **`bearerIn(response)`** — Extracts `Bearer <token|sessionToken>` from a login, re-proof, or password-change response body. Returns an empty-bearer string if neither field is present.
- **`claimedAmr(response, userId)`** — Returns the `amr` claim array. In `jwt` mode decodes it from the access token via `jose.decodeJwt`; in `cookie` mode reads it from the newest session row via `sessionRowsOf`.

## Relationships

- **`src/modules/account/session/config.ts`** — Imports `getSessionMode` to branch between `jwt` and `cookie` modes in `claimedAmr`.
- **`src/modules/users/tests/factories.ts`** — Imports `createUser` and `PLAIN_PASSWORD` for user provisioning inside `loginWithCookie`.
- **`tests/support/cookies.ts`** — Imports `setCookie` and `cookieValue` to parse and read the `__Host-session` cookie from the login response.
- **`tests/support/http.ts`** — Imports `api` (supertest-style wrapper) to perform the login POST.
- **`src/modules/account/tests/factories.ts`** — Imports `sessionRowsOf` for the cookie-mode `amr` lookup.
- **Contract tests (`api`, `oauth`, `reauth`, `shop`)** — Primary consumers; each suite calls `loginWithCookie` and the extractors to set up and verify session state.

## Notes

- `loginWithCookie` intentionally keeps **both** the bearer and the cookie (unlike `authenticateAs`, which drops the cookie). The cookie is what `current`, logout, and refresh operations depend on.
- In `cookie` mode the access token is absent from the response body; the session id (`ses_…`) doubles as the bearer value because the server accepts `Authorization: Bearer ses_…` equivalently to the cookie.
- `claimedAmr` requires a `userId` argument only for the cookie-mode DB lookup; it is unused in `jwt` mode but must still be passed.
- `bearerIn` falls back to `sessionToken` when `token` is missing, covering both mode shapes without the caller branching.
