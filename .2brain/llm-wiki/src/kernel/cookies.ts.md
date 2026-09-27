---
source: src/kernel/cookies.ts
sha256: f049aa5e76809f1dae01dfb666b3546a11cfeda031656252ea7f367656db0db6
generated_at: 2026-09-27T14:18:22.103651+00:00
model: ollama:qwen3.8:27b
---

# src/kernel/cookies.ts

## Purpose
Provides a thin, single-purpose helper for reading one named cookie from an Express `Request`. It centralises the refresh-token cookie name and a generic accessor so that the handful of call-sites across modules (auth middleware, account controllers, observability) share one definition instead of each spelling out `request.cookies['jwt']`.

## Key elements
- **`REFRESH_COOKIE`** — exported constant; the canonical cookie name (`'jwt'`) for the refresh-token credential.
- **`cookieOf(request, name)`** — generic accessor that returns the value of `request.cookies[name]` or `undefined` if the cookie is absent.
- **`readRefreshCookie(request)`** — convenience wrapper around `cookieOf` that always uses `REFRESH_COOKIE`; the primary entry-point most callers import.

## Relationships
- **`middlewares/authorizations.ts`** — the SSE-only auth path reads the refresh cookie via `readRefreshCookie` to authenticate streaming connections.
- **`account/controllers/get-refresh-token.ts`** — reads (and likely re-issues) the refresh cookie when minting a new token.
- **`account/controllers/get-oauth-callback.ts`** — reads the refresh cookie during the OAuth callback to associate the completed auth flow with the existing session.
- **`account/controllers/get-sessions.ts`** — reads the refresh cookie to identify which session to list or inspect.
- **`account/controllers/post-logout.ts`** — reads the refresh cookie to locate and invalidate the session being logged out.
- **`account/oauth/mfa-redirect.ts`** — reads the refresh cookie to preserve the credential across the MFA redirect round-trip.
- **`observability/controllers/get-observability-events.ts`** — reads the refresh cookie to authenticate the SSE events stream.

## Notes
- This file is deliberately minimal: it never *sets* or *deletes* cookies, only reads them. Writing/clearing the refresh cookie is handled by the calling modules.
- `request.cookies` is cast to `Record<string, string | undefined>` internally; callers receive `string | undefined` and are expected to handle the absent case.
- The cookie name is the bare string `'jwt'` (not namespaced or prefixed). Any change to `REFRESH_COOKIE` must be coordinated with the issuing side (likely `get-refresh-token.ts`) and any downstream cookie-clearing logic.
