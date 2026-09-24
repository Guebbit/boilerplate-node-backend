---
source: src/modules/account/oauth/state.ts
sha256: 56b9366522d0737c186002f81a24b0bc5018aad964a5b7b4d35918eaf0b72865
generated_at: 2026-09-23T18:07:10.248397+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/oauth/state.ts

## Purpose

Provides the two per-attempt cookies an OAuth login requires before redirecting to the provider: a CSRF `state` token (double-submit pattern) and a PKCE `code_verifier`. It handles generation, cookie setting/clearing, the S256 challenge derivation, and the callback-side state verification — all stateless, with no server-side session or new secret.

## Key elements

- **`OAUTH_STATE_COOKIE` / `OAUTH_VERIFIER_COOKIE`** — cookie name constants (`oauth_state`, `oauth_verifier`).
- **`generateOAuthState()`** — returns a 128-bit random hex string for the CSRF token.
- **`generateCodeVerifier()`** — returns a 256-bit random base64url string (43 chars, satisfies RFC 7636 §4.1).
- **`codeChallengeOf(verifier)`** — SHA-256 → base64url (S256 transform, RFC 7636 §4.2); used as the `code_challenge` query param.
- **`oauthCookieOptions()`** — shared flags: `httpOnly`, `sameSite: 'lax'`, `secure` only when `NODE_ENV === 'production'`, 5-minute TTL.
- **`createStateCookie` / `createVerifierCookie`** — set the respective cookie on the Express `Response`.
- **`destroyStateCookie` / `destroyVerifierCookie`** — clear the respective cookie (called on both successful and failed callbacks).
- **`stateMatches(cookieValue, queryValue)`** — returns `true` only if both are non-empty strings and are equal (plain comparison, not constant-time).

## Relationships

- **`get-oauth-start.ts`** — consumer: calls `generateOAuthState`, `generateCodeVerifier`, `codeChallengeOf`, then `createStateCookie` / `createVerifierCookie` on the redirect response.
- **`get-oauth-callback.ts`** — consumer: reads the cookie, calls `stateMatches` to verify, then `destroyStateCookie` / `destroyVerifierCookie` regardless of outcome.
- **`oauth-state.test.ts`** — unit-test neighbor exercising every exported function.
- **`fake.ts`** — fake OAuth provider used in tests; may rely on or assert the cookie values this module sets.
- **`oauth-providers.test.ts`** — integration-level tests that exercise the start → callback flow and thus transitively hit these functions.

## Notes

- `oauthCookieOptions` is a **function**, not a frozen constant, so `NODE_ENV` is read at call time rather than at import time.
- `stateMatches` deliberately uses plain `===` (not a timing-safe comparison) because neither value is a stored secret — it defeats a forged callback, not a guessed one.
- Both cookies share the same 5-minute TTL and must be cleared together; forgetting to clear on the failure path would leave a reusable token.
- The verifier is base64url without padding to land exactly on the 43-character minimum of RFC 7636.
