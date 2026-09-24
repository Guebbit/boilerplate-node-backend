---
source: src/modules/account/oauth/providers/github.ts
sha256: c5120aa2bab6dbaf30366d45accf6df90cb9fbf4bcf5040c0357bb59cdfa6d37
generated_at: 2026-09-23T18:06:29.820738+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/oauth/providers/github.ts

## Purpose
Implements the GitHub OAuth2 provider adapter. After the authorization-code exchange, it fetches the user's identity from **two** REST endpoints (`/user` for profile fields, `/user/emails` for the verified primary address) because GitHub can hide the primary email behind a "private" flag, making it absent from `/user`.

## Key elements
- **`githubOAuthProvider`** (export) — the sole public export; an `OAuthProvider` object with `name`, `authorizeUrl`, and `exchangeCode`.
- **`PROVIDER_NAME`** (`'github'`) — the registry key that lands on `OAuthAccount.provider`; used to look up credentials in config.
- **`githubApiGet<T>(path, accessToken)`** (module-private) — thin `fetch` wrapper for the GitHub REST API; sets the bearer token, the `application/vnd.github+json` Accept header, and an `AbortSignal.timeout`; throws on non-2xx.
- **`GithubUser`** / **`GithubEmail`** (local interfaces) — shape the expected JSON from the two profile endpoints; no runtime validation, type annotations only.

## Relationships
- **`../config`** — imports `getOAuthCredentials` (client id/secret) and `OAUTH_FETCH_TIMEOUT_MS` (abort signal duration).
- **`./port`** — imports the `OAuthProvider` and `OAuthIdentity` types; this file is a concrete implementation of that port.
- **`./index`** — re-exports `githubOAuthProvider` so callers can obtain it from the barrel rather than this path directly.
- **`../../tests/unit/oauth-github.test.ts`** — unit-tests the `authorizeUrl` URL shape and the `exchangeCode` happy/error paths by mocking `fetch`.

## Notes
- **PKCE is S256-only.** GitHub does not support `plain`; the `code_challenge_method` is hard-coded.
- **Token exchange expects JSON, not form-encoded.** GitHub's default response is `application/x-www-form-urlencoded`; the `Accept: application/json` header is required to get a JSON body.
- **`githubApiGet`'s generic `<T>` is not a runtime check.** A malformed `/user` response could yield `user.id === undefined`, which `String(undefined)` would turn into the literal `"undefined"` and collide multiple accounts onto one identity row. The `typeof user.id !== 'number'` guard exists specifically to prevent that.
- **Email selection:** only the entry with `primary: true` is used. A verified non-primary address is deliberately excluded — the port's `emailVerified` field reflects *that* primary entry's `verified` flag, not the existence of any verified address.
- **Abort signals** are applied to both the token-exchange POST and every `githubApiGet` call to prevent a hung GitHub response from holding an OAuth callback open.
