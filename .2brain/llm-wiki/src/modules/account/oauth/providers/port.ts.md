---
source: src/modules/account/oauth/providers/port.ts
sha256: 5398ad4cd954ba56b04abe5196eb7a54b39ab075c78d850b7320cd43ae4c5ec7
generated_at: 2026-11-08T04:13:20.917231+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/oauth/providers/port.ts

## Purpose

Defines the `OAuthProvider` port — the structural contract that every identity provider (Google, GitHub, …) implements. Unlike the payments module's single-provider switch, multiple OAuth providers can be enabled simultaneously, so selection is delegated to the registry in `./index`. This file contains no runtime logic; it is purely the seam's type surface.

## Key elements

- **`OAuthIdentity`** — Shape returned by a successful token exchange. Carries `providerId` (the stable subject used as the app's identity key), `email`, `emailVerified` (provider's own claim; security-relevant), and optional `name` / `imageUrl`.
- **`OAuthExpectation`** — Per-attempt secrets the callback exchange must validate against: the CSRF `state` and the PKCE `codeVerifier`.
- **`OAuthProvider`** — The interface every real provider implements. Two members:
  - `authorizeUrl(state, redirectUri, codeChallenge)` — Returns the consent URL; the `codeChallenge` is the S256 hash of the attempt's verifier (RFC 7636).
  - `exchangeCode(callbackUrl, expected)` — Redeems the authorization code and returns `OAuthIdentity`. Throws on state mismatch, malformed/foreign response, or unparseable identity.

## Relationships

- **`providers/github.ts`, `providers/google.ts`** — Concrete implementations of `OAuthProvider`.
- **`providers/index.ts`** — Registry that selects which enabled provider handles a given attempt; the caller of `authorizeUrl` / `exchangeCode`.
- **`providers/client.ts`** — Shared HTTP/OAuth client logic used by the concrete providers when calling `exchangeCode`.
- **`services/oauth.ts`** — Consumes the returned `OAuthIdentity`; stores `providerId` (not `email`) as the account key and enforces the `emailVerified` gate before linking to an existing password account.
- **`scenarios/support/doubles/oauth-fake.ts`** — Test double implementing the port for isolation tests.
- **`tests/integration/oauth-link.test.ts`** — Integration test that exercises the full authorize → callback → exchange flow through the port contract.

## Notes

- `redirectUri` passed to `authorizeUrl` must always be **server-derived** (from config), never taken from an incoming request — the JSDoc flags this explicitly.
- `exchangeCode` receives the callback URL with the **real** query string (`code`, `state`, `iss`) as the provider sent it; reconstructing the URL breaks library-level validation of the full response.
- `providerId` is the canonical identity key in this app, **not** `email`. This is a deliberate choice documented in `services/oauth.ts`.
- `emailVerified` is the *provider's* claim, not an app-side check. An unverified email blocks linking to a pre-existing password account.
- The module doc explicitly contrasts this port with `payments/providers/index.ts`: payments is one-provider-at-a-time via a `NODE_*_PROVIDER` env switch; OAuth is multi-provider via a registry.
