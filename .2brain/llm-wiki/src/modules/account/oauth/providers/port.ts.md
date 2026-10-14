---
source: src/modules/account/oauth/providers/port.ts
sha256: 5398ad4cd954ba56b04abe5196eb7a54b39ab075c78d850b7320cd43ae4c5ec7
generated_at: 2026-10-14T08:44:18.868534+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/oauth/providers/port.ts

## Purpose

Defines the OAuth/OIDC provider **port** — the structural contract that concrete identity providers (Google, GitHub) implement. Unlike the analogous `PaymentProvider` port in `payments/providers/index.ts`, more than one OAuth provider may be enabled simultaneously, so selection is delegated to the registry in `./index` rather than a single environment switch.

## Key elements

- **`OAuthIdentity`** — The payload a successful `exchangeCode` must return. `providerId` is the stable subject the service layer persists as the identity key (never `email`). `emailVerified` is the provider's own attestation and gates whether an unverified email may be linked to an existing password account. `name` and `imageUrl` are optional display fields.
- **`OAuthExpectation`** — Carries the per-attempt `state` (CSRF token) and `codeVerifier` (PKCE secret). The `exchangeCode` implementation must validate the callback against both.
- **`OAuthProvider`** — The port interface itself. Exposes:
  - `name` — persisted on `OAuthAccount.provider`; used by `enabledProviders()`.
  - `authorizeUrl(state, redirectUri, codeChallenge)` — builds the consent URL the browser is sent to. `codeChallenge` is the S256 hash of the PKCE verifier (RFC 7636). `redirectUri` must be server-derived, never request-supplied.
  - `exchangeCode(callbackUrl, expected)` — exchanges the authorization code for an `OAuthIdentity`. Throws on state mismatch, malformed response, foreign `iss`, or failed token exchange. `callbackUrl` must be the real callback URL with the provider's actual query string intact.

## Relationships

- **`providers/google.ts`, `providers/github.ts`** — Concrete implementations of `OAuthProvider`.
- **`providers/index.ts`** — Registry that discovers and selects among enabled `OAuthProvider` implementations at runtime.
- **`providers/client.ts`** — Shared OAuth client infrastructure (token endpoint, etc.) consumed by the concrete providers.
- **`services/oauth.ts`** — The service layer that calls `authorizeUrl` / `exchangeCode`, validates `OAuthExpectation`, stores `OAuthIdentity.providerId`, and enforces the `emailVerified` security rule.
- **`scenarios/support/doubles/oauth-fake.ts`** — Test double implementing this port for integration and unit tests.
- **`tests/integration/oauth-link.test.ts`** — Integration tests that exercise the port through the service layer with real or faked providers.

## Notes

- **Identity key is `providerId`, not `email`.** The service layer (`services/oauth.ts`) stores `providerId` as the link key; `email` is secondary.
- **`emailVerified` is a security gate.** The service refuses to link an unverified email to an existing password account. This flag comes from the provider's own claim, not from local heuristics.
- **`callbackUrl` must preserve the real query string.** The OIDC library validates the full response; rebuilding or dropping parameters (e.g. `iss`) will cause a spurious failure.
- **PKCE is mandatory.** `authorizeUrl` always receives a `codeChallenge`; the corresponding `codeVerifier` lives in `OAuthExpectation` and is checked during `exchangeCode`. There is no implicit "trust the server" path.
- **Multiple providers coexist.** Do not introduce a `NODE_OAUTH_PROVIDER`-style single-provider switch; the registry in `index.ts` handles selection.
