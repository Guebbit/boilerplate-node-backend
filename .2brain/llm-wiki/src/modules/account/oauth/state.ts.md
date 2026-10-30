---
source: src/modules/account/oauth/state.ts
sha256: 701a9a57089b2145a4ca6385ff86f404be5e04b7cdc36f4299b8cc0f4546b02c
generated_at: 2026-10-29T02:37:24.676310+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/oauth/state.ts

## Purpose

Manages the per-attempt cookies that an OAuth login requires before the browser is redirected to the provider: the CSRF `state` (double-submit), the PKCE `code_verifier`, and the untrusted `continue` / `locale` values the visitor supplied. It provides the generation primitives, the Express cookie set/clear helpers, and the read-back validators, all in one place so the start and callback controllers never touch `node:crypto` or cookie-flag logic directly.

## Key elements

- **Cookie-name constants** (`OAUTH_STATE_COOKIE`, `OAUTH_VERIFIER_COOKIE`, `OAUTH_CONTINUE_COOKIE`, `OAUTH_LOCALE_COOKIE`, `OAUTH_LINK_COOKIE`) — all prefixed `__Host-` to block sibling-subdomain injection.
- **`OAUTH_COOKIE_TTL_MS`** — 5 minutes; shared by every cookie in this module.
- **`generateOAuthState()`** — 128-bit random hex string for the CSRF handshake.
- **`generateCodeVerifier()`** — 32 random bytes, base64url-encoded (43 chars, no padding), satisfying RFC 7636 §4.1.
- **`codeChallengeOf(verifier)`** — SHA-256 of the verifier, base64url-digested; the value sent as `code_challenge` (RFC 7636 §4.2).
- **`oauthCookieOptions()`** *(private)* — spreads `hostCookieOptions()` from `session/cookies` and adds the 5-min `maxAge`.
- **`create*Cookie` / `destroy*Cookie` pairs** — five set/clear helpers (state, verifier, link, continue, locale) that call `response.cookie` / `response.clearCookie` with the shared options.
- **`stateMatches(cookieValue, queryValue)`** — plain string equality check; neither side is secret, so no timing-safe compare is needed.
- **`isSameOriginPath(value)`** — type guard: resolves the candidate against a `http://same-origin.invalid` placeholder and confirms the origin is unchanged; rejects absolute URLs, `//evil`, and `/\evil`.
- **`isLocaleTag(value)`** — type guard: matches a BCP 47–shaped tag (2–3 alpha, up to three 2–8 char subtags). Deliberately looser than the set of locales actually served.

## Relationships

- **`src/modules/account/session/cookies.ts`** — supplies `hostCookieOptions()` (secure, same-site, path flags) that `oauthCookieOptions()` extends with the TTL.
- **`src/modules/account/controllers/get-oauth-start.ts`** — calls `generateOAuthState`, `generateCodeVerifier`, `codeChallengeOf`, and the `create*Cookie` helpers to set up the redirect to the provider.
- **`src/modules/account/controllers/post-oauth-link-start.ts`** — same as above plus `createLinkCookie` for the signed-in linking variant.
- **`src/modules/account/controllers/get-oauth-callback.ts`** — reads the cookies back, calls `stateMatches`, `isSameOriginPath`, `isLocaleTag` for validation, then calls the `destroy*Cookie` helpers on both success and failure paths.
- **`src/modules/account/tests/unit/oauth-state.test.ts`** — unit-tests the generators, validators, and set/clear behavior in isolation.
- **`scenarios/support/doubles/oauth-fake.ts`** — test fake that references the cookie-name constants to simulate a completed OAuth round-trip without a real provider.
- **`tests/unit/scenarios/oauth-providers.test.ts`** — end-to-end scenario tests that exercise the full start → callback flow through the real controllers and this module.

## Notes

- **Double validation by design.** `isSameOriginPath` and `isLocaleTag` are applied twice — once against the incoming query param at the start controller and again against the cookie value at the callback — because a cookie is client-writable and can never be trusted on its own.
- **`stateMatches` is intentionally not timing-safe.** The doc comment states that neither the cookie nor the query param is secret; the check defeats a forged callback URL, not a guessed token.
- **`__Host-` prefix is load-bearing.** A browser refuses to let another origin set or overwrite a `__Host-` cookie, so an attacker cannot plant both halves of the double-submit pair.
- **TTL is 5 minutes.** Chosen to be long enough to pick a Google account on a second screen but short enough to bound cookie-reuse windows.
- **No server-side session or signing secret is involved.** Both `state` and `verifier` are self-contained; comparison is value-to-value, not value-to-stored-hash.
