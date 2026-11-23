---
source: src/modules/account/oauth/state.ts
source_sha256: 6128e987fdf212a33beb4c0aeebbee7b15f36f2843206b5056e08ad1366d2ed3
context_sha256: 67bf551e0792525bb04f7c9ab6e75c6f4d1f0504e7293e5f6c6e59238f7ebc29
generated_at: 2026-11-22T03:33:10.489249+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/oauth/state.ts

## Purpose
Owns the per-attempt cookies an OAuth login needs before the browser leaves for the provider: the CSRF `state` (a double-submit cookie, no server-side session or extra secret), the PKCE `verifier`, the saved `continue` path, and the saved `locale`. It also provides the generators, cookie setters/clearers, and validators for those values. `continue` and `locale` are untrusted input, so they are validated before being saved and again when read back.

## Key elements
- **Cookie name constants**: `OAUTH_STATE_COOKIE`, `OAUTH_VERIFIER_COOKIE`, `OAUTH_CONTINUE_COOKIE`, `OAUTH_LOCALE_COOKIE` and `OAUTH_LINK_COOKIE`. All come from `cookieData` in `@infrastructure/http/cookies.generated`. The link cookie is present only when a signed-in account is connecting a provider.
- **`generateOAuthState()`**: 16 random bytes as hex (128 bits).
- **`generateCodeVerifier()`**: 32 random bytes as base64url (43 characters, per RFC 7636 §4.1).
- **`codeChallengeOf(verifier)`**: the S256 transform (SHA-256, base64url) sent to the provider as `code_challenge`.
- **`create*Cookie` / `destroy*Cookie`** for state, verifier, link, continue and locale. Each takes an Express `Response` and sets or clears the cookie with shared options.
- **`stateMatches(cookieValue, queryValue)`**: true only when both values are non-empty strings and are equal. It uses a plain comparison, since neither side is secret.
- **`isSameOriginPath(value)`**: type guard that accepts only a string starting with `/` that resolves to the same origin when parsed with WHATWG `URL` against a placeholder origin. This rejects absolute URLs, `//host` and `/\host`.
- **`isLocaleTag(value)`**: type guard for a BCP 47-shaped tag (2–3 letters, then up to three 2–8 character alphanumeric subtags). It is deliberately looser than the set of served locales.

## Relationships
- **`../session/cookies`**: supplies `hostCookieOptions()`. This file adds a `maxAge` to build the shared `oauthCookieOptions()`.
- **`get-oauth-start.ts`, `post-oauth-link-start.ts`**: the login-start and link-start controllers. They are the "start" side of the handshake, and `isSameOriginPath` is applied at "the start controller" against the query param.
- **`get-oauth-callback.ts`**: the callback side. It checks `state` and re-validates the `continue` and `locale` cookies. The doc comments say every cookie is cleared on both success and failure.
- **`oauth-state.test.ts`** and **`oauth-providers.test.ts`**: tests covering this module.
- **`oauth-fake.ts`**: a scenario test double for the provider.

## Notes
- All cookies share one TTL, taken from the state cookie's `maxAgeMs` in `cookieData`. It is intentionally short, long enough to pick an account and short enough to bound reuse.
- `clearCookie` is called with the same options as `cookie`, so the clear matches the cookie that was set.
- The `__Host-` prefix, via `hostCookieOptions()`, stops a sibling subdomain from planting cookies. Without it, an attacker could inject both halves of the double-submit `state` check.
- Every `destroy*Cookie` is documented as being called at the same points as `destroyStateCookie`.
- `createContinueCookie` and `createLocaleCookie` must only be called with already-validated values. The file does not validate inside them.
- `isSameOriginPath` mirrors the frontend's `usePostLoginRedirect#isSameOriginPath` on purpose, so the two flows share one rule.
- The file's module doc links to a page on why both `state` and PKCE are used, under the "federated-login" section of its authentication defences documentation.
