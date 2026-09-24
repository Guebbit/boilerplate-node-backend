---
source: src/modules/account/oauth/providers/port.ts
sha256: 7dffac377e21e761b1dee5df1cb0dd4683b4fc357710b485d12b47b75d6540fc
generated_at: 2026-09-23T18:06:58.747142+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/oauth/providers/port.ts

## Purpose

Defines the **port** (interface contract) for OAuth/OIDC identity providers in hexagonal architecture. Concrete providers (GitHub, Google, a fake for tests) implement `OAuthProvider`; the OAuth service consumes it. Unlike the payments domain, multiple providers can be enabled simultaneously, so selection is delegated to the sibling `index.ts` registry rather than a single environment switch.

## Key elements

- **`OAuthIdentity`** (interface) — The result of a successful token exchange. Carries `providerId` (the stable subject ID used as the app's identity key), `email`, `emailVerified` (provider's own claim; the OAuth service refuses to link unverified emails to existing password accounts), and optional `name` / `imageUrl`.
- **`OAuthProvider`** (interface) — The contract every provider adapter must satisfy:
    - `name: string` — persisted on `OAuthAccount.provider` and surfaced by `enabledProviders()`.
    - `authorizeUrl(state, redirectUri, codeChallenge): string` — Builds the consent URL. `state` is the CSRF token from `../state.ts`; `redirectUri` is always server-derived (never from the request); `codeChallenge` is the S256 hash of the PKCE verifier (RFC 7636).
    - `exchangeCode(code, redirectUri, codeVerifier): Promise<OAuthIdentity>` — Redeems the authorization code. `redirectUri` must match the one passed to `authorizeUrl` (some providers validate this). `codeVerifier` is the PKCE secret; the provider hashes it and rejects the exchange on mismatch. Throws on failure or unparseable response.

## Relationships

- **`providers/google.ts`**, **`providers/github.ts`** — Concrete implementations of `OAuthProvider`; each supplies a real `authorizeUrl` and `exchangeCode`.
- **`providers/fake.ts`** — A stub implementation used in tests; satisfies the same two methods without network calls.
- **`providers/index.ts`** — The registry that enumerates enabled providers and exposes `enabledProviders()`; this file's `name` field is what the registry keys on.
- **`services/oauth.ts`** — The application service that calls `authorizeUrl` to redirect the user and `exchangeCode` on the callback, then stores `providerId` (not `email`) as the link key.
- **`tests/integration/oauth-link.test.ts`** — Exercises the full authorize → callback → link flow, typically against `fake.ts`.

## Notes

- `providerId` is deliberately the identity key, **not** `email`. Email can change across providers or be reused; `providerId` (the provider's `sub` claim) is stable. See `services/oauth.ts` for the full rationale.
- `emailVerified` is a **provider-issued** claim. The service treats `false` as "do not auto-link to an existing password account"—this is a security boundary, not a display concern.
- `redirectUri` is always derived server-side (`../config.ts`). It is never taken from the incoming request to prevent open-redirect abuse.
- PKCE is mandatory: `authorizeUrl` must embed `code_challenge` + `code_challenge_method=S256`, and `exchangeCode` must send the matching `code_verifier`. The two are paired per-attempt via `../state.ts`.
