---
source: scenarios/support/doubles/oauth-fake.ts
sha256: b4518bff013b4dc99c763963f10fff87e75b70e48b31ddb66b525bc6505788bf
generated_at: 2026-11-08T02:33:46.600819+00:00
model: ollama:qwen3.8:27b
---

# scenarios/support/doubles/oauth-fake.ts

## Purpose

A fake OAuth identity provider (test double) that implements the real `OAuthProvider` port with zero network calls. It lets tests and the dev preload exercise the full authorize → callback → exchange flow — including CSRF `state` round-trip and PKCE verifier/challenge matching — without ever leaving the app or rendering a consent screen.

## Key elements

- **`FAKE_OAUTH_CODE`** (`'fake-oauth-code'`) — the fixed code prefix every fake `code` must carry; `exchangeCode` rejects anything else.
- **`FAKE_IDENTITY`** (module-private) — the single, pre-verified user object (`providerId`, `email`, `emailVerified`, `name`) that every fake login resolves to.
- **`fakeOAuthProvider`** (`OAuthProvider`) — the exported provider object:
  - `authorizeUrl(state, redirectUri, codeChallenge)` — builds a callback URL that carries the fixed code with the PKCE challenge appended (dot-separated, base64url) and the real `state` param. No redirect to an external IdP.
  - `exchangeCode(callbackUrl, { codeVerifier })` — splits the code param, verifies the prefix, then re-derives the challenge from `codeVerifier` via `codeChallengeOf` and compares it to the embedded challenge. Rejects on mismatch; resolves `FAKE_IDENTITY` on success.

## Relationships

- **Implements** `OAuthProvider` from `src/modules/account/oauth/providers/port.ts` — the structural contract (name, authorizeUrl, exchangeCode) this file satisfies.
- **Imports** `codeChallengeOf` from `src/modules/account/oauth/state.ts` to perform the PKCE challenge re-derivation inside `exchangeCode`.
- **Registered by** `scenarios/support/development-doubles.ts` (dev preload path) and by each test file that needs it, so the fake is never visible to production code.
- **Consumed by** the contract tests (`oauth.contract.test.ts`, `login-paths.contract.test.ts`, `config.contract.test.ts`), integration tests (`auth-races.test.ts`, `login-restore.test.ts`, `session-modes.test.ts`, `social-login-with-a-second-factor.test.ts`), and the unit test `scenarios/oauth-providers.test.ts`, which all wire it into the OAuth registry in place of a real provider.

## Notes

- The PKCE check is performed **by the fake itself** (not by the callback controller) because there is no server-side challenge store. The challenge is smuggled inside the `code` param (after a dot). The callback controller is opaque to this — it only forwards `code` — so the assertion is equivalent to what a real provider would do at redemption.
- `authorizeUrl` encodes `state` with `encodeURIComponent` but appends the challenge raw (assumed base64url). If the challenge ever contained a dot the split would break; in practice PKCE challenges are 43-char base64url.
- `imageUrl` in `FAKE_IDENTITY` is intentionally `undefined`; tests that assert avatar rendering must handle the absence.
- The file is a `@module` — it exports only `FAKE_OAUTH_CODE` and `fakeOAuthProvider`. `FAKE_IDENTITY` is not public API.
