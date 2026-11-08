---
source: src/modules/account/oauth/state.ts
sha256: d8f2807f2818af984928cf6be38f9fb072937b1bb5b6bbd19a8ae9a2ab3b364b
generated_at: 2026-11-08T04:13:36.079419+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/oauth/state.ts

## Purpose

Manages the per-attempt cookie set that an OAuth login needs before the browser leaves for the provider. It owns generation of the CSRF `state` token and PKCE `verifier`, provides create/destroy helpers for all five OAuth cookies, and exports the validation functions (`stateMatches`, `isSameOriginPath`, `isLocaleTag`) that the callback controller uses before trusting any cookie value read back from the client.

## Key elements

- **Cookie name constants** (`OAUTH_STATE_COOKIE`, `OAUTH_VERIFIER_COOKIE`, `OAUTH_CONTINUE_COOKIE`, `OAUTH_LOCALE_COOKIE`, `OAUTH_LINK_COOKIE`) — sourced from `cookieData` in `@infrastructure/http/cookies.generated`.
- **`generateOAuthState()`** — 128-bit random hex string for the CSRF double-submit token.
- **`generateCodeVerifier()`** — 32 random bytes base64url-encoded (43 chars, satisfying RFC 7636 §4.1).
- **`codeChallengeOf(verifier)`** — SHA-256 S256 transform (RFC 7636 §4.2) producing the `code_challenge` sent to the provider.
- **`create*Cookie` / `destroy*Cookie`** (one pair per cookie) — thin wrappers around `response.cookie` / `response.clearCookie` using a shared `oauthCookieOptions()` (host-prefix flags + minutes-scale TTL).
- **`stateMatches(cookieValue, queryValue)`** — plain string equality check for the double-submit comparison; not a secret comparison.
- **`isSameOriginPath(value)`** — type guard confirming the value resolves to the same origin via WHATWG `URL` parsing; blocks absolute URLs, `//evil`, and `/\evil` tricks.
- **`isLocaleTag(value)`** — type guard ensuring the value is a BCP 47-shaped tag (2–3 letters, up to three subtags).

## Relationships

- **`src/modules/account/session/cookies.ts`** — provides `hostCookieOptions()`, which `oauthCookieOptions()` spreads to inherit the `__Host-`/`Secure`/`SameSite` flags.
- **`src/modules/account/controllers/get-oauth-start.ts`** — calls `generateOAuthState`, `generateCodeVerifier`, `codeChallengeOf`, and the `create*Cookie` helpers to set cookies before redirecting the browser to the provider.
- **`src/modules/account/controllers/get-oauth-callback.ts`** — reads the cookies back, runs `stateMatches` / `isSameOriginPath` / `isLocaleTag`, then calls the `destroy*Cookie` helpers to clear them (on both success and failure paths).
- **`src/modules/account/controllers/post-oauth-link-start.ts`** — uses `createLinkCookie` / `destroyLinkCookie` for the signed-in account linking flow.
- **`src/modules/account/tests/unit/oauth-state.test.ts`** — unit tests exercising every exported function in this file.
- **`scenarios/support/doubles/oauth-fake.ts`** — test double that sets and reads these cookies to simulate a full OAuth round-trip.
- **`tests/unit/scenarios/oauth-providers.test.ts`** — scenario-level tests that drive the start→callback flow and assert cookie lifecycle.

## Notes

- All five cookies carry the `__Host-` prefix (via `hostCookieOptions`), so a sibling subdomain cannot plant or overwrite them; this is what makes the double-submit `state` check un-forgeable from another origin.
- `isSameOriginPath` and `isLocaleTag` are intentionally applied **twice** (start controller against the query param, callback controller against the cookie) because a cookie is client-writable and its value is never trusted on its own.
- `stateMatches` uses a plain `===` comparison, not a constant-time one — both sides are unguessable random values, not secrets compared against a stored hash.
- The TTL (`OAUTH_COOKIE_TTL_MS`) is minutes-scale: long enough to pick an account on the provider's UI, short enough to bound replay.
- `PLACEHOLDER_ORIGIN` (`http://same-origin.invalid`) is only a parsing anchor for `isSameOriginPath`; it is never sent to a browser.
