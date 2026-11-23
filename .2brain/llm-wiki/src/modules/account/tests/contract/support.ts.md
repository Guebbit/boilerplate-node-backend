---
source: src/modules/account/tests/contract/support.ts
source_sha256: 119c90a35bd528783deae250b52123a368bc5b87d87817630c1f9290b7d3848d
context_sha256: 65b3188881f85596415cde4df73eaf063d321a9de75de447e62dbeac5ba1b8d6
generated_at: 2026-11-22T03:51:28.736560+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/tests/contract/support.ts

## Purpose
Shared setup helpers for the account contract test suites. They hide the difference between the `jwt` and `cookie` session modes, so the suites can log in, build bearer headers and read the `amr` claim without branching on the mode.

## Key elements
- **`loginWithCookie(overrides?)`**: Creates a user with `createUser`, then POSTs `/account/login` with the user's email and `PLAIN_PASSWORD`.
  - It throws if the status isn't 200 or no `__Host-session` cookie is set.
  - It returns `{ user, bearer, jwtCookie }`. `bearer` is `Bearer <body.token>` in `jwt` mode. Otherwise it falls back to the cookie's value, which is the `ses_…` session id.
  - It keeps both the bearer and the cookie, because `current`, logout and refresh depend on the cookie, and `authenticateAs` drops it.
- **`bearerIn(response)`**: Builds `Bearer …` from `body.token`, falling back to `body.sessionToken`, then to an empty string. It is meant for login, re-proof and password-change responses.
- **`claimedAmr(response, userId)`**: Returns the `amr` (what the holder proved) of the session a response opened.
  - In `jwt` mode it decodes `body.token` with `jose`'s `decodeJwt`.
  - Otherwise it reads the newest row from `sessionRowsOf(userId)` and returns its `amr`, or `[]` if there is none.

## Relationships
- `../../session/config`: `getSessionMode()` decides which branch `claimedAmr` takes.
- `../factories` (account tests): `sessionRowsOf` supplies the session rows for `claimedAmr` in cookie mode.
- `@modules/users/tests/factories`: supplies `createUser` and `PLAIN_PASSWORD`.
- `@tests/http` (`tests/support/http.ts`): supplies `api()`, the HTTP client used for the login request.
- `@tests/cookies` (`tests/support/cookies.ts`): supplies `setCookie` and `cookieValue` for reading the session cookie.
- The `api`, `oauth`, `reauth` and `shop` contract test files in this folder are the suites this setup is shared with.

## Notes
- In cookie mode the credential is an opaque id and the `amr` claim exists only in the database, which is why `claimedAmr` queries session rows. It assumes the newest row (`.at(-1)`) is the session that response opened.
- `loginWithCookie` falls back to the cookie value for the bearer only when the response body has no `token`. `Authorization: Bearer ses_…` is accepted as well as the cookie.
