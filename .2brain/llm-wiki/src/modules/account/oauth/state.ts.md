---
source: src/modules/account/oauth/state.ts
sha256: 6b0b67fb7d933834fc4c51330b3d88c8523f0e0cc902d82f3dbb2badf7fc4c86
generated_at: 2026-11-14T18:38:37.369683+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/oauth/state.ts

## Purpose

Defines the per-attempt cookie set and helper functions that carry an OAuth login from the start controller through the provider round-trip and back to the callback. It mints CSRF `state` and PKCE `verifier` tokens, provides idempotent cookie set/destroy pairs, and supplies the validation predicates (`isSameOriginPath`, `isLocaleTag`, `stateMatches`) that the callback must apply before trusting any client-writable cookie value.

## Key elements

- **Cookie name constants** — `OAUTH_STATE_COOKIE`, `OAUTH_VERIFIER_COOKIE`, `OAUTH_CONTINUE_COOKIE`, `OAUTH_LOCALE_COOKIE`, `OAUTH_LINK_COOKIE`: re-exported from `cookieData` in `@infrastructure/http/cookies.generated`.
- **`OAUTH_COOKIE_TTL_MS`** — shared TTL (minutes-scale) pulled from the same generated cookie metadata.
- **`generateOAuthState()`** — 128-bit random hex string (CSRF token).
- **`generateCodeVerifier()`** — 32 random bytes base64url-encoded (PKCE verifier, 43 chars per RFC 7636 §4.1).
- **`codeChallengeOf(verifier)`** — SHA-256 → base64url (RFC 7636 §4.2 S256 transform).
- **`oauthCookieOptions()`** (internal) — spreads `hostCookieOptions()` (yields the `__Host-` prefix, among other flags) and sets `maxAge`.
- **Cookie set/destroy pairs** — `createStateCookie`/`destroyStateCookie`, `createVerifierCookie`/`destroyVerifierCookie`, `createLinkCookie`/`destroyLinkCookie`, `createContinueCookie`/`destroyContinueCookie`, `createLocaleCookie`/`destroyLocaleCookie`. Each set takes an Express `Response` and a value; each destroy clears the cookie with the same options.
- **`stateMatches(cookieValue, queryValue)`** — plain string equality guard for the double-submit CSRF check.
- **`isSameOriginPath(value)`** — type-guard: value must be a string starting with `/` that resolves to the same origin under WHATWG URL parsing (catches `//evil`, `/\evil`, absolute URLs, etc.).
- **`isLocaleTag(value)`** — type-guard: value must match a loose BCP 47 subtag pattern (`/^[A-Z]{2,3}(?:-[\dA-Z]{2,8}){0,3}$/i`).

## Relationships

- **`src/modules/account/session/cookies.ts`** — provides `hostCookieOptions()`, which supplies the `__Host-` prefix and other cookie flags consumed by every cookie set/destroy in this file.
- **`src/modules/account/controllers/get-oauth-start.ts`** — calls the token generators, `codeChallengeOf`, and the `create*` cookie functions to arm the browser before the 302 to the provider.
- **`src/modules/account/controllers/get-oauth-callback.ts`** — reads the cookies back, applies `stateMatches`, `isSameOriginPath`, and `isLocaleTag`, then calls the `destroy*` functions on both success and failure paths.
- **`src/modules/account/controllers/post-oauth-link-start.ts`** — calls `createLinkCookie` when a signed-in account initiates provider linking (no `state`/`verifier` involved in that path).
- **`src/modules/account/tests/unit/oauth-state.test.ts`** — unit-tests the generators, `codeChallengeOf`, `stateMatches`, `isSameOriginPath`, and `isLocaleTag` in isolation.
- **`tests/unit/scenarios/oauth-providers.test.ts`** — exercises the full start→callback sequence using this module's cookie helpers alongside provider fakes.
- **`scenarios/support/doubles/oauth-fake.ts`** — test double that fabricates the cookie values this module validates, used in scenario-level tests.

## Notes

- **Plain comparison in `stateMatches`.** The comparison is deliberately not constant-time; neither the cookie nor the query param is secret (the token is handed to the provider in the same response). This is not a password check.
- **Double validation of `continue` and `locale`.** Both are validated at the start controller (against the query param) *and* again at the callback (against the cookie readback), because a cookie is client-writable and must never be trusted on first read alone.
- **`PLACEHOLDER_ORIGIN`.** `isSameOriginPath` resolves against `http://same-origin.invalid` rather than the real host, so the check is pure and environment-independent.
- **`LOCALE_TAG` is intentionally loose.** It accepts any syntactically valid BCP 47 tag shape; the deployment's actual supported-locale list is enforced by the frontend, not here.
- **`__Host-` prefix is the subdomain isolation mechanism.** The `hostCookieOptions()` import is what prevents a sibling subdomain from planting or overwriting the `state` cookie and winning the double-submit check.
