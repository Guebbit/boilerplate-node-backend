---
source: src/modules/account/controllers/get-oauth-callback.ts
sha256: fc49f731c3825a8b940b0aab9b1cb9b150e958510221550228714961214cb147
generated_at: 2026-10-15T09:53:57.176595+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/get-oauth-callback.ts

## Purpose

Handles `GET /account/oauth/:provider/callback` — the redirect a browser receives after the OAuth provider's consent screen. Validates the CSRF `state` against its cookie, exchanges the authorization code (with PKCE verifier), resolves or creates the account, then either mints a session, routes through the 2FA challenge flow, or fails back to the frontend with a `?error=` query param. Only three response shapes ever reach the browser: 404 (unknown provider), 400 (state/verifier mismatch), or 302.

## Key elements

- **`getOAuthCallback(request, response)`** — the sole export; full callback pipeline from state check through code exchange, account resolution, session issuance (or MFA challenge), and cookie cleanup.
- **`clearOAuthCookies(response)`** — internal helper that destroys all four single-use cookies (`state`, `verifier`, `continue`, `locale`) at every terminal outcome, success or failure.

## Relationships

- **`routes.ts`** — mounts `getOAuthCallback` at the `/account/oauth/:provider/callback` path.
- **`oauth/providers/index.ts`** — `resolveOAuthProvider` looks up the provider config; its `exchangeCode` method performs the token exchange.
- **`oauth/state.ts`** — supplies `stateMatches`, cookie-destroy helpers, `isSameOriginPath`, `isLocaleTag`, and the four cookie name constants.
- **`oauth/config.ts`** — provides `oauthCallbackUrl`, `oauthFrontendCallbackUrl`, and `oauthFrontendMfaCallbackUrl` for building redirect targets.
- **`oauth/mfa-redirect.ts`** — `createMfaChallengeCookie` stores the 2FA challenge for the frontend to pick up.
- **`services/index.ts` / `services/oauth.ts`** — `loginOrCreateFromOAuth` resolves the account; `recordOAuthFailure` logs the audit row; `twoFactorService.buildLoginChallenge` creates the MFA step; typed error classes (`OAuthEmailUnverifiedError`, `OAuthAccountUnverifiedError`, `OAuthAccountUnavailableError`) drive catch-branch routing.
- **`session/device-cookie.ts`** — `rememberDevice` marks the completed login so the per-account failure budget is skipped on that device.
- **`metrics.ts`** — `authOauthTotal` Prometheus counter incremented with `{provider, status}` labels.
- **`infrastructure/i18n/index.ts` / `context.ts`** — `t()` localizes the 404/400 error strings.
- **`infrastructure/http/response.ts`** — `rejectResponse` emits the 404/400 JSON bodies (the only non-redirect responses).
- **`infrastructure/http/cookies.ts`** — `cookieOf` reads the request cookies.
- **`infrastructure/http/request.ts`** — `callerContextOf` extracts the audit context (IP, UA, etc.).
- **`infrastructure/adapters/logger.ts`** — logs unexpected catch-branch errors (provider/exchange failures) with provider name and error.

## Notes

- **Fail-closed PKCE:** a missing or empty verifier cookie is rejected outright (400) rather than falling through to a non-PKCE exchange — a provider that never received a challenge will happily accept a verifier-less exchange, so the two cases must never share a branch.
- **Trusting order:** `continue` and `locale` cookies are only read *after* `state` validates. A forged callback must not be able to steer a stranger's browser; both values are also re-validated (`isSameOriginPath`, `isLocaleTag`) because cookies are client-writable.
- **302 vs. JSON after navigation begins:** once the code-exchange step starts the browser is mid-navigation, so all subsequent failures redirect to the frontend with `?error=<code>` instead of returning a JSON body.
- **2FA is account-scoped, not method-scoped:** if `user.twoFactorEnabledAt` is set, the OAuth login routes through `twoFactorService` just like the password path. Skipping this would let a provider alone satisfy a second factor.
- **Audit de-duplication:** `recordLoginSuccess` fires only when `outcome === 'login'`. The `link` and `signup` paths already emit their own audit rows inside `loginOrCreateFromOAuth`; recording `AUTH_LOGIN` again would double-count.
- **`provedAt` is captured *before* `exchangeCode`:** if the user changes their password during the async exchange, the subsequent login check can detect the stale proof and refuse.
- **Stryker annotations** (`Stryker disable all` / `restore all`) wrap the `logger.error` call to suppress mutation tests on that single line.
