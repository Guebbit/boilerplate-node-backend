---
source: src/modules/account/oauth/providers/fake.ts
sha256: 06f658c87bc2e7e4e939366df20145159cd3bf8ce56a7c2a61f042005409093f
generated_at: 2026-09-23T18:06:19.529645+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/oauth/providers/fake.ts

## Purpose

A no-network OAuth provider that simulates a full sign-in flow (CSRF state round-trip + PKCE verification) without any external service. It exists so demo mode and Cypress specs can exercise the real callback and token-exchange paths without leaving the application.

## Key elements

- **`FAKE_OAUTH_CODE`** – Exported constant (`'fake-oauth-code'`). The fixed prefix every fake authorization code must carry; `exchangeCode` rejects anything else.
- **`FAKE_IDENTITY`** – Module-private object. The single, already-verified identity that every fake login resolves to (fixed `providerId`, `email`, `name`; `imageUrl` is `undefined`).
- **`fakeOAuthProvider`** – Exported `OAuthProvider` implementation:
    - `authorizeUrl(state, redirectUri, codeChallenge)` – Returns the redirect URI immediately with `?code=fake-oauth-code.<challenge>&state=<encoded>` appended. No consent screen; the PKCE challenge is embedded in the code itself (base64url, dot-separated).
    - `exchangeCode(code, _redirectUri, codeVerifier)` – Splits the code on `.`, validates the prefix, re-derives the challenge from the verifier via `codeChallengeOf`, and rejects on mismatch. On success, resolves `FAKE_IDENTITY`.

## Relationships

- **`providers/port.ts`** – Supplies the `OAuthProvider` type that `fakeOAuthProvider` implements; defines the `authorizeUrl` / `exchangeCode` contract.
- **`providers/index.ts`** – Registers (or conditionally exposes) `fakeOAuthProvider`; the module doc references `isDemoMode()` gating, which lives on the consumer side rather than in this file.
- **`state.ts`** – Provides `codeChallengeOf`, the S256 challenge-derivation helper used inside `exchangeCode` to verify the PKCE round-trip.
- **`tests/unit/oauth-providers.test.ts`** – Unit-tests this provider's `authorizeUrl` URL shape, `exchangeCode` success path, and rejection paths (bad prefix, PKCE mismatch).

## Notes

- PKCE is self-contained: because there is no server-side challenge store, the challenge travels _inside_ the `code` value (after the dot). The callback controller treats the code as an opaque string and never inspects it; all verification happens in `exchangeCode`.
- The code format is `fake-oauth-code.<base64url-challenge>` — a single dot separates the two parts. Consumers splitting on `.` will get exactly two segments on the happy path.
- `imageUrl` is intentionally `undefined` in `FAKE_IDENTITY`; downstream code that renders an avatar must handle the absent case.
- The `redirectUri` parameter in `exchangeCode` is unused (prefixed `_`); the fake provider never needs to re-validate it.
