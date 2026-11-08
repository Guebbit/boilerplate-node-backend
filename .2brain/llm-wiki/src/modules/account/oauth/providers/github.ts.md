---
source: src/modules/account/oauth/providers/github.ts
sha256: fb17bd55a1b52880b6b5c618625978b069329283ef852890ec749cdc73b48007
generated_at: 2026-11-08T04:12:46.653828+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/oauth/providers/github.ts

## Purpose

Implements the GitHub OAuth2 provider behind the shared `OAuthProvider` port. GitHub is plain OAuth 2.0 (no OIDC, no ID token), so after the code exchange the identity is assembled from two REST calls (`/user` + `/user/emails`) because a primary email marked private never appears on `/user`.

## Key elements

- **`PROVIDER_NAME`** (`'github'`) — registry key that lands on `OAuthAccount.provider`.
- **`SERVER`** (`client.ServerMetadata`) — hard-coded endpoint metadata (issuer, authorization, token). No discovery; GitHub publishes no `/.well-known` document.
- **`GithubUser` / `GithubEmail`** — narrow interfaces for the two REST responses this app actually reads.
- **`githubApiGet<T>(path, accessToken)`** — typed bearer fetch to `api.github.com` with a `Timeout` signal and `redirect: 'error'`; body is size-capped via `readCappedJson`.
- **`identityOf(user, emails)`** — maps the two responses to `OAuthIdentity`. Throws (rather than casting) when `id` is missing or no primary email exists, preventing a `"undefined"` providerId collision.
- **`githubOAuthProvider`** (exported `OAuthProvider`) — the sole public export. Wires `authorizeUrl` (PKCE, scope `read:user user:email`) and `exchangeCode` (token redeem → parallel `/user` + `/user/emails` → `identityOf`) together.

## Relationships

- **`./port.ts`** — imports the `OAuthProvider` and `OAuthIdentity` types that this file fulfils.
- **`./client.ts`** — delegates URL construction (`authorizationUrlFor`, `configurationFor`) and token redemption (`redeemCode`) to the shared openid-client helpers.
- **`../config.ts`** — reads `OAUTH_FETCH_TIMEOUT_MS` for the fetch abort signal.
- **`@infrastructure/http/read-capped-body.ts`** — uses `readCappedJson` + `DEFAULT_BODY_CAP_BYTES` to prevent unbounded body reads on the API responses.
- **`./index.ts`** — registers/exports this provider into the provider table.
- **`src/modules/account/tests/unit/oauth-github.test.ts`** — unit-tests the identity mapping and error paths.

## Notes

- PKCE is passed through `codeChallenge` in `authorizeUrl`; GitHub has supported PKCE since July 2025.
- The `Accept: application/vnd.github+json` header is required by the GitHub REST API; versioning is header-based, not URL-segment-based.
- `readCappedJson` returns a `Promise<T>` cast; the generic is an annotation, not a runtime check — callers are responsible for reading only the fields they expect (hence `identityOf`'s explicit guards).
- A failed code exchange from GitHub can return HTTP 200 with an `error` body; the `redeemCode` helper in `client.ts` handles that rejection — this file does not.
