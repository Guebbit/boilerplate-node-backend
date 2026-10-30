---
source: src/modules/account/oauth/config.ts
sha256: b2669c5172b2f34b10dec019aa0714c06ab0140fea61a824f6d43f257a8bf3b2
generated_at: 2026-10-29T02:36:31.993790+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/oauth/config.ts

## Purpose

Centralised OAuth configuration: declares the four `NODE_OAUTH_*` env vars, computes the absolute redirect/callback URIs from `NODE_URL`, and builds the frontend redirect URLs (success, 2FA, deletion-grace). It exists so that `./providers/*` and the account controllers never spell an env-var name or assemble a redirect URI themselves.

## Key elements

- **`OAUTH_FETCH_TIMEOUT_MS`** (5000) — shared `AbortSignal.timeout` budget for every outbound provider HTTP call (token exchange, GitHub profile/email).
- **`oauthConfig`** — `defineConfig` block declaring `NODE_OAUTH_GOOGLE_CLIENT_ID/SECRET` and `NODE_OAUTH_GITHUB_CLIENT_ID/SECRET`; its `check` rejects boot when a provider is enabled but `mailDelivers` is false (passwordless accounts would be locked out of step-up).
- **`OAuthCredentials`** — interface for a provider's `{ clientId?, clientSecret? }`.
- **`getOAuthCredentials(name)`** — returns the pair for `'google'` or `'github'`; empty object for anything else.
- **`isOAuthProviderConfigured(name)`** — true only when both halves are set; the registry's "is this provider live?" check.
- **`oauthRedirectUri(provider)`** — absolute `NODE_URL + /account/oauth/<provider>/callback`, built via `new URL` so a missing trailing slash on `NODE_URL` cannot corrupt the path.
- **`oauthCallbackUrl(provider, originalUrl)`** — the same base with the request's **raw** query string sliced off `originalUrl` (avoids the parser folding repeated `code` into an array).
- **`oauthFrontendCallbackUrl(errorCode?, continueTo?, locale?, linked?)`** — `NODE_FRONTEND_URL/oauth/callback` + query params for the success / link / error paths.
- **`oauthFrontendMfaCallbackUrl(challenge, continueTo?, locale?)`** — same base; carries `mfaRequired`, `expiresAt`, `methods` (token itself stays in `MFA_CHALLENGE_COOKIE`).
- **`oauthFrontendDeletionCallbackUrl(pending, continueTo?, locale?)`** — same base; carries `deletionPending`, `purgeAt`, `expiresAt` (claim check stays in its own cookie).

## Relationships

- **`@infrastructure/config/define`** — supplies `defineConfig` and `isRelaxedIn` (the latter gates the mail check in test envs).
- **`@infrastructure/config/fields`** — supplies the `text()` field descriptor used in `oauthConfig.shape`.
- **`@infrastructure/adapters/config`** — provides `mailConfig`, read inside the boot `check`.
- **`@infrastructure/adapters/mail-transports`** — provides `mailDelivers`, the predicate in the boot `check`.
- **`@infrastructure/http/config`** — provides `siteConfig` (source of `NODE_URL` and `NODE_FRONTEND_URL`).
- **`controllers/get-oauth-start.ts` / `post-oauth-link-start.ts`** — call `isOAuthProviderConfigured`, `getOAuthCredentials`, and `oauthRedirectUri` to build the provider-authorisation redirect.
- **`controllers/get-oauth-callback.ts`** — calls `oauthCallbackUrl`, `oauthFrontendCallbackUrl`, `oauthFrontendMfaCallbackUrl`, and `oauthFrontendDeletionCallbackUrl`.
- **`oauth/providers/client.ts` / `github.ts` / `index.ts`** — read `getOAuthCredentials` and `OAUTH_FETCH_TIMEOUT_MS`; `index.ts` uses `isOAuthProviderConfigured` as its registry gate.
- **`tests/unit/oauth-*.test.ts` / `reauth-policy.test.ts`** — exercise the config shape, the boot `check`, and the URL builders.

## Notes

- **Redirect URI is never request-derived.** `oauthRedirectUri` builds exclusively from `NODE_URL`; a request-supplied `redirect_uri` is treated as an open-redirect vector and is never honoured.
- **`oauthCallbackUrl` uses the raw `originalUrl` string**, not `request.query`. Re-parsing would collapse a repeated `code` parameter into an array and hide the library's "duplicate param" rejection.
- **`continueTo` is a caller-validated value** (checked against `isSameOriginPath` in `oauth/state.ts` before being passed in). The URL builders do not re-validate; passing a raw cookie/query value would be a bug.
- **Secrets never enter the frontend URLs.** The MFA challenge token and the deletion claim token are deliberately excluded from the URL and travel in dedicated cookies (`MFA_CHALLENGE_COOKIE`, the deletion cookie). The builders accept `Omit`/`Pick` types to make that exclusion structural.
- **Boot check is environment-gated.** `isRelaxedIn(environment)` skips the mail-deliverability assertion in test, where SMTP is typically stubbed.
