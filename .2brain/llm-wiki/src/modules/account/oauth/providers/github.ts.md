---
source: src/modules/account/oauth/providers/github.ts
sha256: fb17bd55a1b52880b6b5c618625978b069329283ef852890ec749cdc73b48007
generated_at: 2026-10-14T08:43:31.999803+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/oauth/providers/github.ts

## Purpose

Implements the `OAuthProvider` port for GitHub's plain OAuth 2.0 flow. Because GitHub publishes no issuer metadata and requires two separate API calls to reconstruct a full identity (`/user` + `/user/emails`), this file hard-codes the server endpoints, performs the code exchange via the shared `client` helpers, and maps the results into the canonical `OAuthIdentity` shape.

## Key elements

- **`PROVIDER_NAME`** (`'github'`) — the string key used in the provider registry and in `OAuthAccount.provider`.
- **`SERVER`** (`client.ServerMetadata`) — static, hand-written endpoint map (authorize / token). GitHub does not expose discovery; `issuer` is a label only.
- **`GithubUser` / `GithubEmail`** — minimal response shapes for `GET /user` and `GET /user/emails`.
- **`githubApiGet<T>(path, accessToken)`** — authenticated `fetch` wrapper for the GitHub REST API. Sets the `Accept: application/vnd.github+json` header, enforces a timeout via `AbortSignal.timeout`, rejects redirects, and parses the body through `readCappedJson`.
- **`identityOf(user, emails)`** — maps the two API responses to `OAuthIdentity`. Validates that `user.id` is a number and that a primary email exists; falls back to `login` when `name` is absent.
- **`githubOAuthProvider`** (export) — the `OAuthProvider` object wired into the registry. Exposes `authorizeUrl` (PKCE) and `exchangeCode` (token redemption → parallel profile/emails fetch → `identityOf`).

## Relationships

- **`../config.ts`** — reads `OAUTH_FETCH_TIMEOUT_MS` for the `AbortSignal.timeout` on every API call.
- **`./client.ts`** — uses `configurationFor`, `authorizationUrlFor`, and `redeemCode` for all `openid-client` plumbing (server config, PKCE authorize URL, token redemption including GitHub's HTTP-200-with-error-body quirk).
- **`./port.ts`** — supplies the `OAuthProvider` and `OAuthIdentity` types this file implements / produces.
- **`./index.ts`** — the registry that registers `githubOAuthProvider` under the key `'github'`.
- **`@infrastructure/http/read-capped-body`** — provides `readCappedJson` and `DEFAULT_BODY_CAP_BYTES` to safely parse API responses with a byte cap.
- **`tests/unit/oauth-github.test.ts`** — unit tests covering the identity mapping and exchange logic.

## Notes

- `openid-client` is imported **type-only** (`import type * as client`); no runtime dependency on the library's values in this file.
- GitHub's identity requires **two sequential API calls** after the code exchange because `/user` omits the email when it is marked private. A non-primary verified email is deliberately *not* used as the identity email (see `port.ts` docs on `emailVerified`).
- `identityOf` performs a **runtime check** on `user.id` rather than an unconditional `String()` cast, preventing the literal string `"undefined"` from becoming a providerId that would collapse multiple accounts onto one row.
- All outbound `fetch` calls use `redirect: 'error'` — an OAuth callback must never silently follow a redirect to an unchosen host.
- GitHub API versioning is done via the `Accept` header (`application/vnd.github+json`), not a URL path segment.
- PKCE (RFC 7636) is passed through `codeChallenge` in `authorizeUrl`; GitHub has supported it since July 2025.
