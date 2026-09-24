---
source: src/modules/account/session/cookies.ts
sha256: f98d927733ebb16cb62f7bb678c82f0f46925c20affe62c82c4dc0b72e8baa16
generated_at: 2026-09-23T18:11:09.869335+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/cookies.ts

## Purpose

Creates and destroys the two HTTP session cookies — `jwt` (httpOnly credential carrying the refresh token) and `isAuth` (a readable UI hint so the client shell can render logged-in chrome before its first network round-trip). Kept separate from JWT validation/signing logic so cookie mechanics have one owner.

## Key elements

- **`createRefreshCookie(response, token, remember?)`** — Sets the `jwt` cookie. Flags: `httpOnly`, `secure` (production only), `sameSite: 'lax'`, `path: '/'`. The `remember` param accepts a tier name (`RefreshTokenExpiryTime`) **or** a raw ms number (used when a rotated token must carry forward its own remaining lifetime).
- **`destroyRefreshCookie(response)`** — Clears `jwt`. Must mirror the exact attribute set from `createRefreshCookie` for the browser to match and delete the cookie.
- **`createLoggedCookie(response, remember?)`** — Sets the `isAuth` cookie to `'true'`. Deliberately **not** `httpOnly` and **not** `secure`; it holds no credential, only a boolean hint readable by client JS.
- **`destroyLoggedCookie(response)`** — Clears `isAuth`.
- **Imports** — `RefreshTokenExpiryTime` (type) and `getExpiryTimeMilliseconds` (fn) from `./config`.

## Relationships

- **`./config.ts`** — Source of the `RefreshTokenExpiryTime` union and the tier→ms resolver used for cookie `maxAge`.
- **Controllers (`post-logout`, `post-logout-everywhere`, `get-refresh-token`, `post-reset-confirm`, `delete-account-confirm`)** — Call the create/destroy functions with the Express `Response` to set or clear cookies during their respective flows.
- **`session.ts`** — Sibling module handling the higher-level session lifecycle; this file is the cookie-transport layer it delegates to.
- **`tests/unit/cookies.test.ts`** — Unit tests covering the cookie-setting/clearing behavior.

## Notes

- `secure` is gated on `NODE_ENV === 'production'` so local `http://` development still works; in any non-production env the cookie is sent over plain HTTP.
- The `remember` parameter is **polymorphic**: a string tier or a number. Callers that rotate a token pass the remaining ms directly rather than a tier, so the new cookie doesn't outlive the token it replaces.
- `path: '/'` is required on both create and destroy because the refresh and logout endpoints live on different paths; a narrower path would prevent the browser from sending/clearing the cookie at the other endpoint.
- `isAuth` has no `httpOnly` flag by design — it exists specifically so client-side code can read it without a network request.
