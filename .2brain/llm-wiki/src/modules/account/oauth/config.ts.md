---
source: src/modules/account/oauth/config.ts
source_sha256: da8f9f2e42c1f772cbccc2101c07a15256ab868f1c3ff04d4d3594aa89257e99
context_sha256: 6de1b4988b00fd0812e8122a588e029ede598bd162138f76a5b4ae4d69f5b84c
generated_at: 2026-11-22T03:31:31.296981+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/oauth/config.ts

## Purpose
Single place for OAuth-related configuration and URL building. It reads the `NODE_OAUTH_*` env vars, so providers and controllers never reference those names directly, and it builds the backend redirect URIs and the frontend landing-page URLs used by the OAuth flow. It reads policy only; it holds or mints no secrets or tokens.

## Key elements
- `OAuthCallbackError`: type of the `?error=` values the frontend callback page understands, derived from `REDIRECT_QUERY_ENUMS.completeOAuthLogin.error`.
- `OAUTH_FETCH_TIMEOUT_MS` (5000): shared timeout for a provider's outbound HTTP calls (token exchange, GitHub profile/email follow-ups), meant for `AbortSignal.timeout`.
- `oauthConfig`: `defineConfig` schema named `account-oauth` with Google and GitHub client ID/secret fields (secrets marked `sensitive`).
- `OAuthCredentials` / `getOAuthCredentials(name)`: returns `{clientId, clientSecret}` for `'google'` or `'github'`, or `{}` for any other name.
- `isOAuthProviderConfigured(name)`: true only when both ID and secret are set.
- `oauthRedirectUri(provider)`: absolute `<NODE_URL>/account/oauth/<provider>/callback`, built with `new URL` through the private `backendUrl`.
- `oauthCallbackUrl(provider, originalUrl)`: the redirect URI with the raw query string from `originalUrl` attached, returned as a `URL`.
- `oauthFrontendCallbackUrl(errorCode?, continueTo?, locale?, linked?)`: frontend `/oauth/callback` URL with optional `error`, `linked`, `continue` and `locale` query params.
- `oauthFrontendMfaCallbackUrl(challenge, continueTo?, locale?)`: frontend URL carrying `mfaRequired=1`, `expiresAt`, JSON-encoded `methods`, and optional `defaultMethod`, `continue` and `locale`.
- `oauthFrontendDeletionCallbackUrl(pending, continueTo?, locale?)`: frontend URL carrying `deletionPending=1`, `purgeAt` and `expiresAt`, plus optional `continue` and `locale`.

## Relationships
- Uses `defineConfig` (`src/infrastructure/config/define.ts`) and `text` (`src/infrastructure/config/fields.ts`) to declare the env schema.
- Uses `siteConfig()` from `src/infrastructure/http/config.ts` for `NODE_URL` (backend base) and `NODE_FRONTEND_URL` (frontend base).
- Imports `MfaChallenge` and `DeletionPending` types from `@types` (`src/types/index.ts`).
- Imports `REDIRECT_QUERY_ENUMS` from `@api/redirect-query`.
- Consumers (per the dependency graph): the OAuth controllers (`src/modules/account/controllers/get-oauth-start.ts`, `get-oauth-callback.ts`, `post-oauth-link-start.ts`), the provider files (`src/modules/account/oauth/providers/github.ts`, `index.ts`), `src/modules/account/module.ts`, and the GitHub and Google unit tests (`src/modules/account/tests/unit/oauth-github.test.ts`, `oauth-google.test.ts`).

## Notes
- Redirect URIs always derive from `NODE_URL`, never from the request's Host, scheme or a request-supplied target. This avoids open-redirect and callback-confusion issues.
- `backendUrl` uses `new URL` rather than string concatenation, so a `NODE_URL` with or without a trailing slash works. An unset `NODE_URL` falls back to the localhost default, which only a skipped boot check (`NODE_ENV=test`) lets through.
- `oauthCallbackUrl` slices the raw query off `originalUrl` instead of rebuilding it from `request.query`. A rebuilt query would hide repeated parameters (such as `code`) that the OAuth library is meant to reject.
- `continueTo` is the only request-derived part of the frontend URLs. Callers must validate it with `isSameOriginPath` (`src/modules/account/oauth/state.ts`), and `locale` with `isLocaleTag` from the same file, before passing them in.
- The MFA and deletion URLs carry only non-secret data. The challenge token and the deletion claim check travel in cookies (`src/modules/account/oauth/mfa-redirect.ts`, `src/modules/account/oauth/deletion-redirect.ts`). The MFA function's parameter type omits `challenge` so the token can't be serialized into the URL.
- Adding a provider means adding fields to `oauthConfig` and a branch in `getOAuthCredentials`. Any other name gets `{}` and counts as unconfigured.
