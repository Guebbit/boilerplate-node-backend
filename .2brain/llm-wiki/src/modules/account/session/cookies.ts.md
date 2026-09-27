---
source: src/modules/account/session/cookies.ts
sha256: 33d1c4857944e582232ffb84b80d1533cf3da9afe7a30f193642a7909fcbddca
generated_at: 2026-09-27T14:32:04.772735+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/session/cookies.ts

## Purpose

Encapsulates HTTP cookie creation and destruction for the two session cookies the app uses: `jwt` (the refresh-token credential, httpOnly) and `isAuth` (a non-secret flag the client shell reads to render auth chrome before its first API response). Deliberately decoupled from JWT parsing/validation so any layer that needs to set or clear cookies does so through one place.

## Key elements

- **`secureCookieOptions()`** – Returns the shared flag set for credential cookies (`httpOnly`, `secure` gated on `NODE_ENV`, `sameSite: 'lax'`, `path: '/'`). Exported as a function (not a constant) so `NODE_ENV` is re-read on every call.
- **`createRefreshCookie(response, token, remember?)`** – Sets the `jwt` cookie. `remember` accepts either a `RefreshTokenExpiryTime` tier (resolved via `getExpiryTimeMilliseconds`) or a raw `maxAge` in milliseconds (used when a rotated token carries its own remaining lifetime).
- **`destroyRefreshCookie(response)`** – Clears the `jwt` cookie using the same attributes set at creation (browsers match on path/domain/flags, not name alone).
- **`createLoggedCookie(response, remember?)`** – Sets the `isAuth` cookie to `'true'`. Intentionally omits `httpOnly` and `secure` because it holds no credential; the client JS may read it.
- **`destroyLoggedCookie(response)`** – Clears `isAuth` with `path: '/'` (no other attributes needed since it was never set with them).

## Relationships

- **`session/config.ts`** – Imports the `RefreshTokenExpiryTime` type and `getExpiryTimeMilliseconds` helper used to resolve tier-based expiry values.
- **`oauth/state.ts` / `oauth/mfa-redirect.ts`** – Import `secureCookieOptions` to apply the same security flags to OAuth state, verifier, and MFA-challenge cookies.
- **Controllers** (`post-logout`, `post-logout-everywhere`, `get-refresh-token`, `delete-account-confirm`, `post-reset-confirm`) – Call the create/destroy functions when issuing, rotating, or tearing down a session.
- **`tests/unit/cookies.test.ts`** – Unit-tests the cookie helpers in isolation.

## Notes

- `secureCookieOptions` is a **function**, not a frozen object. Do not destructure or cache it at module top-level in consuming code; call it at the point of use so environment changes (e.g. in tests) are picked up.
- When clearing a cookie, the flags passed to `clearCookie` must match those set at creation time or the browser will silently ignore the clear. `destroyRefreshCookie` and `destroyLoggedCookie` already handle this; don't clear these cookies with bare `response.clearCookie('jwt')`.
- The dual type of the `remember` parameter (tier string **or** raw ms) is intentional: rotated refresh tokens must forward their *existing* remaining lifetime rather than snapping to a configured tier. Callers that pass a tier are starting a fresh session; callers that pass a number are mid-rotation.
