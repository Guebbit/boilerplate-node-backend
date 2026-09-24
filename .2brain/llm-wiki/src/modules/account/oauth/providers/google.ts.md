---
source: src/modules/account/oauth/providers/google.ts
sha256: f553d13971ecf80f7e929ee79579e8b47d2834a66a7e5ba3e7f15da1713f275f
generated_at: 2026-09-23T18:06:39.170357+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/oauth/providers/google.ts

## Purpose

Implements the Google OAuth/OIDC provider behind the `OAuthProvider` port. Extracts user identity directly from the ID token claims returned during the token exchange, avoiding a second `userinfo` round-trip.

## Key elements

- **`googleOAuthProvider`** (exported) — The `OAuthProvider` implementation. Provides `authorizeUrl` (builds the Google auth URL with PKCE S256) and `exchangeCode` (POSTs to Google's token endpoint, decodes the `id_token`, validates claims, returns an `OAuthIdentity`).
- **`assertValidClaims`** — Checks `iss` against a known-issuer set, `aud` against the app's `client_id`, `exp` against current time, and ensures `sub` is a non-empty string. Deliberately does **not** verify the JWT signature (see Notes).
- **`GoogleIdTokenClaims`** (interface) — The subset of ID token claims this app reads: `iss`, `aud`, `exp`, `sub`, `email`, `email_verified`, `name`, `picture`.
- **`PROVIDER_NAME`** — `'google'`; used as the registry key and looked up in `getOAuthCredentials`.
- **`VALID_ISSUERS`** — Set of two accepted `iss` values (with and without `https://` prefix).

## Relationships

- **`./port`** — Consumes the `OAuthProvider` interface and `OAuthIdentity` type; `googleOAuthProvider` is a concrete implementation of that contract.
- **`../config`** — Calls `getOAuthCredentials(PROVIDER_NAME)` to obtain `clientId`/`clientSecret`; uses `OAUTH_FETCH_TIMEOUT_MS` as the `AbortSignal.timeout` value for the token-exchange `fetch`.
- **`providers/index.ts`** — Expected to register/export `googleOAuthProvider` alongside other providers (registry pattern).
- **`tests/unit/oauth-google.test.ts`** — Unit tests exercising the authorize URL construction, code exchange, and claim-validation logic.

## Notes

- **Signature verification is intentionally omitted.** The rationale (documented in the `assertValidClaims` JSDoc): the token arrives over a server-to-server HTTPS call this app initiated, the same trust boundary that protects the `code` and `access_token`. Only `iss`, `aud`, `exp`, and `sub` presence are validated.
- **`email_verified` is polymorphic.** Google may return `true`/`false` (boolean) or the string `'true'`. The code normalises both to a boolean.
- **PKCE is always S256.** There is no `plain` fallback; the server is assumed capable of hashing.
- **`decode` from `jsonwebtoken`** is used with `{ json: true }` and the result cast to `GoogleIdTokenClaims`. This is decode-only — no key material is involved.
- **Issuer check tolerates both `accounts.google.com` and `https://accounts.google.com`**, matching what Google has historically emitted.
