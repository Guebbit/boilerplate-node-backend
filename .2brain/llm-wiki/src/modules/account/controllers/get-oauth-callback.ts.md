---
source: src/modules/account/controllers/get-oauth-callback.ts
sha256: 83830c05213844fb785924970d3c44675bb81920b988870c9d62844bff415b53
generated_at: 2026-09-23T18:00:25.033565+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/get-oauth-callback.ts

## Purpose

Express route handler for `GET /account/oauth/:provider/callback`. Validates the CSRF `state` and PKCE verifier against cookies, exchanges the authorization code with the resolved provider, then finds-or-creates the account and either mints a session or bounces the browser into the MFA challenge flow. Every failure after the provider is known is communicated via a `302` redirect carrying `?error=<code>`, because the browser is mid-navigation and a JSON body is unreadable.

## Key elements

- **`getOAuthCallback`** (sole export) — The full callback pipeline: provider lookup → state check → verifier check → code exchange → account resolution → session or MFA → frontend redirect.
- **`failToFrontend`** (local helper) — Records the audit/metric event, destroys the state & verifier cookies, and issues a `302` to the frontend callback URL with a reason code. Used for every post-validation failure (access denied, provider error, unverified email/account, unexpected exception).

## Relationships

- **`../oauth/providers`** — `resolveOAuthProvider` maps the URL param to a provider adapter (or `null` for a 404).
- **`../oauth/state`** — `stateMatches` validates the `state` query param against the cookie; `destroyStateCookie` / `destroyVerifierCookie` clear them on exit; cookie name constants are imported.
- **`../oauth/config`** — `oauthRedirectUri` supplies the redirect URI for the token exchange; `oauthFrontendCallbackUrl` / `oauthFrontendMfaCallbackUrl` build the final 302 targets.
- **`../oauth/mfa-redirect`** — `createMfaChallengeCookie` sets the challenge cookie when 2FA is required.
- **`../services`** — `loginOrCreateFromOAuth` resolves the account; `twoFactorService.buildLoginChallenge` creates the MFA challenge; `recordOAuthFailure` writes the audit event; `OAuthEmailUnverifiedError` / `OAuthAccountUnverifiedError` are caught to produce distinct frontend error codes.
- **`../session/session`** — `issueSession` mints the server-side session cookie.
- **`../session/login-observability`** — `recordLoginSuccess` logs the successful login (only for `outcome === 'login'`).
- **`../metrics`** — `authOauthTotal` Prometheus counter incremented with `{ provider, status }`.
- **`@modules/access`** — `rolesOf` reads the user's current tenant roles (needed to decide unrestricted vs. restricted in the audit record).
- **`@kernel/access/tenant`** — `DEPLOYMENT_TENANT_ID` scopes the role lookup.
- **`@kernel/permissions`** — `isUnrestrictedRole` classifies the tenant role for the success metric.
- **`@infrastructure/i18n`** — `t` produces localized messages for the 404/400 JSON bodies.
- **`@infrastructure/http/request`** — `callerContextOf` extracts the caller context used in audit records.
- **`@infrastructure/http/response`** — `rejectResponse` emits the 404/400 JSON error bodies.
- **`@infrastructure/adapters/logger`** — logs the generic "OAuth callback failed" error with provider name and stack (developer-facing only).
- **`../routes`** — registers this handler at the `/account/oauth/:provider/callback` path.

## Notes

- **PKCE is mandatory.** A missing or empty verifier cookie returns a hard `400` (`invalid_verifier`). The code never falls back to a no-PKCE exchange, because a provider that received no initial challenge will happily accept one without a verifier.
- **Two distinct unverified codes.** `OAuthEmailUnverifiedError` → `?error=email_unverified` (verify with the provider) vs. `OAuthAccountUnverifiedError` → `?error=account_unverified` (reset the password on the existing account). The frontend must branch on which one it receives.
- **MFA is an account-level control.** If `user.twoFactorEnabledAt` is set, a successful OAuth code exchange still routes through `twoFactorService.buildLoginChallenge`; the provider alone cannot satisfy a deliberately armed second factor.
- **Audit double-counting guard.** `recordLoginSuccess` fires only when `outcome === 'login'`. The `link` and `signup` outcomes are already audited inside `loginOrCreateFromOAuth`; emitting `AUTH_LOGIN` again would double-log under a second action name.
- **Stryker suppression.** The `logger.error` call is wrapped in `// Stryker disable all` / `// Stryker restore all` to prevent mutation-testing from altering the error-logging branch.
- **Failure-path asymmetry.** Only the pre-exchange checks (unknown provider, bad state, bad verifier) return a JSON body (`404`/`400`). Everything after the exchange — including provider-side errors and internal exceptions — redirects `302` with a query-param error code.
