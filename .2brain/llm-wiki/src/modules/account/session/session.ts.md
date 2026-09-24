---
source: src/modules/account/session/session.ts
sha256: 5dff6590345b3d0cf639724fad9702ab62fdc761015cd7262a3068be8bbf3870
generated_at: 2026-09-23T18:11:59.467244+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/session.ts

## Purpose

Provides a single shared entry point—`issueSession`—for the three-step tail (refresh token → cookies → access token) that every authentication flow must run when minting or re-minting a live session. Extracted from `postLogin` so other controllers (notably `postPasswordChange`) reuse the logic instead of duplicating cookie minting.

## Key elements

- **`issueSession(response, userId, remember?, amr?)`** — The sole export. Orchestrates the sequence: `createRefreshToken` → `createRefreshCookie` + `createLoggedCookie` → `createAccessToken`. Returns the signed access token string (the caller decides how to send it in the response body). Throws if the refresh token cannot be persisted or signed.
    - `remember` (optional) controls cookie expiry tier; omitted falls back to the same default `postLogin` uses.
    - `amr` (optional) sets the `auth_time` proof method; omitted falls back to `createRefreshToken`'s default `['pwd']`.

## Relationships

- **`./jwt`** — Imports `createRefreshToken` (step 1) and `createAccessToken` (step 3).
- **`./cookies`** — Imports `createRefreshCookie` and `createLoggedCookie` (step 2).
- **`./config`** — Imports the `RefreshTokenExpiryTime` type used as the `remember` parameter's type.
- **Controllers** (`post-login.ts`, `post-password-change.ts`, `post-signup.ts`, `post-reauth.ts`, `post-login-2fa.ts`, `get-oauth-callback.ts`) — These are the call sites that invoke `issueSession` after their flow-specific authentication logic completes, rather than minting cookies/tokens inline.

## Notes

- This file is intentionally tiny: it is a _composition_ of `jwt` + `cookies` calls, not a source of business logic itself. If you need to change token shape or cookie attributes, edit `jwt.ts` or `cookies.ts`, not this file.
- The access token is **returned** (not sent) by `issueSession`; the calling controller is responsible for putting it in the response body. The refresh/logged cookies, by contrast, are set directly on the `Response` object inside this function.
- The module JSDoc points to `docs/modules/account-sessions.md` for broader design context.
