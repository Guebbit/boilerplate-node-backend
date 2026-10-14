---
source: src/modules/account/oauth/state.ts
sha256: 7505606dacb2955264e1607970d76e13fdb31a0069c722cf7dd1f7d005f70b7c
generated_at: 2026-10-14T08:44:39.954413+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/oauth/state.ts

## Purpose

Manages the per-attempt cookies that an OAuth login round-trip requires: the CSRF `state` token (double-submit pattern, not a server-side session), the PKCE `code_verifier`, and two convenience values (`continue` path, `locale`). It mints tokens, sets/clears the corresponding Express cookies, and provides the validation predicates the callback controller uses to verify a returned request is legitimate before acting on it.

## Key elements

- **Cookie name constants** — `OAUTH_STATE_COOKIE`, `OAUTH_VERIFIER_COOKIE`, `OAUTH_CONTINUE_COOKIE`, `OAUTH_LOCALE_COOKIE`: the literal cookie names shared across the flow.
- **`OAUTH_COOKIE_TTL_MS`** (module-private) — 5-minute TTL; long enough to pick a provider account, short enough to bound replay.
- **`generateOAuthState()`** — returns a 128-bit hex token for the CSRF handshake.
- **`generateCodeVerifier()`** — returns a 43-char base64url string (32 random bytes) satisfying RFC 7636 §4.1 length rules.
- **`codeChallengeOf(verifier)`** — computes the S256 (`SHA-256` → base64url) code challenge per RFC 7636 §4.2.
- **`createStateCookie` / `destroyStateCookie`** — set or clear the `oauth_state` cookie on an Express `Response`.
- **`createVerifierCookie` / `destroyVerifierCookie`** — same pair for `oauth_verifier`.
- **`createContinueCookie` / `destroyContinueCookie`** — same pair for `oauth_continue`.
- **`createLocaleCookie` / `destroyLocaleCookie`** — same pair for `oauth_locale`.
- **`stateMatches(cookieValue, queryValue)`** — constant-time-unnecessary equality check (neither side is a secret) used by the callback to confirm the round-trip.
- **`isSameOriginPath(value)`** — type-guard that a `continue` value is a same-origin relative path; uses WHATWG `URL` resolution against a placeholder origin to catch `//evil`, `/\evil`, etc.
- **`isLocaleTag(value)`** — type-guard that a `locale` value matches a permissive BCP 47 shape (2-3 alpha subtag + up to three 2-8-char subtags).

## Relationships

- **`src/modules/account/session/cookies.ts`** — imports `secureCookieOptions` so every OAuth cookie inherits the same `httpOnly`/`sameSite`/`secure` flags as session cookies.
- **`src/modules/account/controllers/get-oauth-start.ts`** — calls `generateOAuthState`, `generateCodeVerifier`, `codeChallengeOf`, the four `create*Cookie` helpers, and `isSameOriginPath`/`isLocaleTag` to validate query params before setting cookies and redirecting to the provider.
- **`src/modules/account/controllers/get-oauth-callback.ts`** — reads the cookies, calls `stateMatches`, re-validates `continue`/`locale` via `isSameOriginPath`/`isLocaleTag`, exchanges the code, then calls all four `destroy*Cookie` helpers.
- **`src/modules/account/tests/unit/oauth-state.test.ts`** — unit-tests the token generators, the S256 transform, `stateMatches`, `isSameOriginPath`, and `isLocaleTag`.
- **`scenarios/support/doubles/oauth-fake.ts`** — supplies a fake OAuth provider that exercises the cookie set/clear cycle in integration scenarios.
- **`tests/unit/scenarios/oauth-providers.test.ts`** — scenario-level tests that exercise the full start→callback flow, exercising the cookie lifecycle end-to-end.

## Notes

- **Double-submit, not server-side session.** The `state` value is minted and delivered in the *same* response that sets the cookie; no server store is involved. The callback trusts the request only when the cookie value equals the query-param value. This means a stolen `state` cookie alone (or a forged query param alone) is insufficient.
- **`continue` and `locale` are untrusted input.** They are validated with `isSameOriginPath` / `isLocaleTag` **twice**: once in the start controller (against the query param) and again in the callback (against the cookie value, because a cookie is client-writable). Never read a cookie value and use it directly.
- **All four cookies share identical lifetime and clearing points.** Any code path that calls `destroyStateCookie` must also call the other three destroy helpers; they are grouped by convention, not enforced by a single function.
- **`isSameOriginPath` uses a placeholder origin (`http://same-origin.invalid`).** This is not a real host; it exists solely so `new URL(value, origin)` can resolve relative paths. The check is whether the resolved origin *equals* the placeholder — any absolute URL, protocol-relative URL, or backslash-slash escape will resolve elsewhere and fail.
- **`isLocaleTag` is deliberately looser than the set of locales the app actually serves.** It only prevents injection-shaped values into a redirect URL; the frontend is responsible for ignoring tags it does not support.
