---
source: src/modules/account/oauth/providers/github.ts
source_sha256: f99bdc4cc598978c3040f06ad3a877ab20dc7e7dc70462a217e80a84a96a0371
context_sha256: 9b967bd831ac2501d79fc597026616b7b05528abbab054687bcbe7e1554150d7
generated_at: 2026-11-22T03:32:15.191040+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/oauth/providers/github.ts

## Purpose
Implements the GitHub OAuth provider behind the app's `OAuthProvider` port. GitHub is plain OAuth 2.0 with no ID token, so after the code exchange the identity is assembled from two REST calls: `/user` for the profile and `/user/emails`, because a private primary email never appears on `/user`.

## Key elements
- `githubOAuthProvider` (exported): the `OAuthProvider` implementation, registered under the name `'github'` (this lands on `OAuthAccount.provider`).
  - `authorizeUrl(state, redirectUri, codeChallenge)`: builds the authorization URL with scope `read:user user:email` and a PKCE code challenge.
  - `exchangeCode(callbackUrl, expected)`: redeems the code, then fetches `/user` and `/user/emails` in parallel with the access token and maps them with `identityOf`.
- `SERVER`: hard-coded `ServerMetadata` (authorization and token endpoints). `issuer` is only a label the library requires, since GitHub publishes no discovery document or keys.
- `githubApiGet<T>(path, accessToken)`: bearer `fetch` against `https://api.github.com` with `Accept: application/vnd.github+json`. It uses an abort timeout (`OAUTH_FETCH_TIMEOUT_MS`) and `redirect: 'error'`. It throws on a non-OK status and reads the body through `readCappedJson` with `DEFAULT_BODY_CAP_BYTES`.
- `identityOf(user, emails)`: validates and maps the responses into an `OAuthIdentity`.
  - `providerId` is `String(user.id)`.
  - `email` and `emailVerified` come from the entry marked `primary`.
  - `name` is `user.name ?? user.login`.
  - `imageUrl` is `avatar_url`.
- `GithubUser` / `GithubEmail`: local interfaces for the fields read from the API.

## Relationships
- `./client`: supplies `configurationFor`, `authorizationUrlFor` and `redeemCode`. These do the library-level OAuth work, including rejecting GitHub's HTTP 200 responses that carry an `error` body.
- `./port`: defines the `OAuthProvider` and `OAuthIdentity` types this file implements and returns.
- `../config`: provides `OAUTH_FETCH_TIMEOUT_MS`.
- `@infrastructure/http/read-capped-body` (`src/infrastructure/http/read-capped-body.ts`): provides `readCappedJson` and `DEFAULT_BODY_CAP_BYTES`, which bound the size of API responses.
- `./index`: the providers registry; it is expected to consume `githubOAuthProvider` (the key comment refers to "this registry").
- `src/modules/account/tests/unit/oauth-github.test.ts`: the unit test for this provider.

## Notes
- `identityOf` checks that `user.id` is a number instead of casting. Otherwise a malformed response would yield the providerId `"undefined"` and collide accounts onto one identity.
- It throws if no email is marked primary. It uses only the primary address, and a non-primary verified address is deliberately not treated as the same claim. `emailVerified` reflects the primary's `verified` flag.
- The generic type argument on `githubApiGet` is only an annotation. The response is not validated at that point.
- PKCE is used; the source notes GitHub has supported it since July 2025.
