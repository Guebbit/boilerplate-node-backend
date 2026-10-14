---
source: scenarios/support/doubles/oauth-fake.ts
sha256: b4518bff013b4dc99c763963f10fff87e75b70e48b31ddb66b525bc6505788bf
generated_at: 2026-10-14T07:04:00.012065+00:00
model: ollama:qwen3.8:27b
---

# scenarios/support/doubles/oauth-fake.ts

## Purpose

A test double that implements the `OAuthProvider` port with zero network calls. It lets specs drive the full authorize → callback → exchange flow inside the app itself: `authorizeUrl` lands straight on the callback route with a fixed code, and `exchangeCode` validates PKCE before returning a single hardcoded identity. Exists so OAuth code paths (CSRF state round-trip, PKCE challenge verification) can be exercised without a real provider or consent screen.

## Key elements

- **`FAKE_OAUTH_CODE`** — exported constant (`'fake-oauth-code'`); the fixed prefix that `exchangeCode` requires before it will accept a code at all.
- **`fakeOAuthProvider`** — exported object satisfying the `OAuthProvider` port. Two methods:
  - `authorizeUrl(state, redirectUri, codeChallenge)` — returns the callback URL with `code=fake-oauth-code.<base64url challenge>` and the real `state` param. No consent page.
  - `exchangeCode(callbackUrl, { codeVerifier })` — splits the code on `.`, rejects anything without the `FAKE_OAUTH_CODE` prefix, re-derives the challenge via `codeChallengeOf(codeVerifier)` and rejects on mismatch, then resolves to the fixed `FAKE_IDENTITY`.
- **`FAKE_IDENTITY`** (module-private) — the single resolved identity: `providerId: 'fake-oauth-subject'`, `email: 'oauth.demo@example.com'`, `emailVerified: true`.

## Relationships

- **Implements** `OAuthProvider` from `src/modules/account/oauth/providers/port.ts`.
- **Calls** `codeChallengeOf` from `src/modules/account/oauth/state.ts` to re-derive the PKCE challenge inside `exchangeCode`.
- **Registered by** `scenarios/support/development-doubles.ts` (dev preload) and consumed directly by the test files below.
- **Consumed by** `src/modules/account/tests/contract/oauth.contract.test.ts`, `src/modules/account/tests/contract/login-paths.contract.test.ts`, and `tests/unit/scenarios/oauth-providers.test.ts`.

## Notes

- The PKCE challenge is smuggled *inside* the `code` parameter (after a `.` separator) because this fake has no server-side store. The callback controller is opaque to this — it only forwards the code string — so the round-trip is structurally identical to a real provider's, not a no-op.
- `exchangeCode` **rejects** (does not just resolve) on unrecognised codes or PKCE mismatch, so a broken caller that skips `codeVerifier` will fail loudly rather than silently pass.
- Never registered into the OAuth registry by production code; only the dev preload and test suites wire it in.
