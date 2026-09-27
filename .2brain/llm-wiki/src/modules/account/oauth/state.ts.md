---
source: src/modules/account/oauth/state.ts
sha256: 9d8feccb29ac6ec694d8742405fab958f416c3d7a2a772826e308bd8ec536e67
generated_at: 2026-09-27T14:28:01.273788+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/oauth/state.ts

## Purpose

Manages the three per-attempt cookies that bracket an OAuth login round-trip before the browser ever reaches the provider: the CSRF `state` (double-submit), the PKCE `verifier`, and the `continue` redirect path. It mints, sets, validates, and destroys those cookies on an Express `Response` so that the start controller and the callback controller share a single, consistent cookie contract without any server-side session state.

## Key elements

- **Cookie name constants** — `OAUTH_STATE_COOKIE`, `OAUTH_VERIFIER_COOKIE`, `OAUTH_CONTINUE_COOKIE`: the literal cookie names shared by start and callback controllers.
- **`OAUTH_COOKIE_TTL_MS`** (5 min) — single TTL applied to all three cookies via the internal `oauthCookieOptions()` helper, which spreads `secureCookieOptions()` (imported from `../session/cookies`) and adds `maxAge`.
- **`generateOAuthState()`** — returns a 128-bit hex token (`randomBytes(16)`).
- **`generateCodeVerifier()`** — returns a 43-char base64url string (`randomBytes(32)`), satisfying RFC 7636 §4.1.
- **`codeChallengeOf(verifier)`** — S256 transform (SHA-256 → base64url) per RFC 7666 §4.2; the value sent to the provider as `code_challenge`.
- **`createStateCookie` / `destroyStateCookie`** — set or clear the `oauth_state` cookie on a given `Response`.
- **`createVerifierCookie` / `destroyVerifierCookie`** — same pattern for `oauth_verifier`.
- **`createContinueCookie` / `destroyContinueCookie`** — same pattern for `oauth_continue`.
- **`stateMatches(cookieValue, queryValue)`** — plain string equality check (type-guarded, non-empty); intentionally not a timing-safe comparison because neither side is secret.
- **`isSameOriginPath(value)`** — type-guard that a string is a single-slash relative path (rejects absolute URLs and `//evil.example`). Used both at start (validating the query param) and at callback (re-validating the cookie value, since cookies are client-writable).

## Relationships

- **`src/modules/account/session/cookies.ts`** — provides `secureCookieOptions()`, which every cookie set/clear in this file inherits (HttpOnly, Secure, SameSite, etc.).
- **`src/modules/account/controllers/get-oauth-start.ts`** — calls `generateOAuthState`, `generateCodeVerifier`, `codeChallengeOf`, `createStateCookie`, `createVerifierCookie`, `createContinueCookie`, and `isSameOriginPath` to initiate an attempt.
- **`src/modules/account/controllers/get-oauth-callback.ts`** — calls `stateMatches` to verify the round-trip, then `destroyStateCookie`, `destroyVerifierCookie`, `destroyContinueCookie` (success or failure), and re-applies `isSameOriginPath` to the stored `continue` cookie.
- **`src/modules/account/tests/unit/oauth-state.test.ts`** — unit-tests every export in this file (generation, cookie set/clear, `stateMatches`, `isSameOriginPath`).
- **`src/modules/account/tests/unit/oauth-providers.test.ts`** — exercises the fake provider alongside state/verifier generation.
- **`src/modules/account/oauth/providers/fake.ts`** — test-only provider that round-trips `state` and `code_verifier` without a real identity server; exercised by the tests above.

## Notes

- **Double-submit, not session.** The `state` value is never stored server-side; security depends solely on the cookie/query-param equality check. There is no lookup table or signed token.
- **`continue` is untrusted input.** It is validated with `isSameOriginPath` twice — once at set-time (query param) and again at read-time (cookie value) — because a client can rewrite the cookie. The comment explicitly warns against trusting it blind.
- **`stateMatches` is deliberately a plain `===`.** Neither value is secret; a timing-safe compare is intentionally absent to avoid implying a threat model that doesn't apply.
- **All three cookies share identical lifetime and clearing points.** If you add a clearing site, all three `destroy*` calls must appear together (the callback controller does this in both success and error paths).
- **TTL is 5 minutes by design.** Long enough to pick a Google account, short enough to limit the reuse window of a leaked cookie.
