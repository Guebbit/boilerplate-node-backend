---
source: src/modules/account/controllers/get-oauth-callback.ts
sha256: 97cacad42719321983755492f327ff7a08267296f281bd7308a5b18e45c37345
generated_at: 2026-09-27T14:23:04.789296+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/get-oauth-callback.ts

## Purpose

Controller for `GET /account/oauth/:provider/callback` — the endpoint a third-party OAuth provider's consent screen redirects the browser back to. It validates the CSRF `state` and PKCE `verifier` against their cookies, exchanges the authorization code, finds-or-creates the account, then either mints a session or issues an MFA challenge. All failures after the state check redirect the browser to the paired frontend with `?error=<code>` because the response is a 302 navigation, not a JSON API call.

## Key elements

- **`getOAuthCallback(request, response)`** — sole export; the full callback handler. Resolves the provider, validates state/verifier, exchanges the code, calls `loginOrCreateFromOAuth`, then branches on 2FA status to either issue a session or build an MFA challenge. Records metrics (`authOauthTotal`) on every terminal path.
- **`clearOAuthCookies(response)`** — internal helper that destroys the three single-attempt cookies (`state`, `verifier`, `continue`) in one shot; called at every outcome (success, failure, MFA-redirect).
- **`recordFailureAndClear(reason)`** (closure) — audits the failure via `recordOAuthFailure`, bumps the failure metric, and clears cookies.
- **`failToFrontend(reason)`** (closure) — wraps `recordFailureAndClear` then issues a 302 to `oauthFrontendCallbackUrl(reason)` so the frontend's own callback page can surface the error to the user.

## Relationships

- **`../oauth/providers/index.ts`** — `resolveOAuthProvider` maps the `:provider` URL param to a provider object; the provider's `exchangeCode` performs the token exchange.
- **`../oauth/state.ts`** — `stateMatches` validates the CSRF token; `destroyStateCookie`/`destroyVerifierCookie`/`destroyContinueCookie` clear the single-attempt cookies; `isSameOriginPath` guards the `continue` redirect target; exports the three cookie name constants.
- **`../oauth/config.ts`** — `oauthRedirectUri` (the provider-registered redirect URI for the token exchange), `oauthFrontendCallbackUrl` (frontend landing for success/error), `oauthFrontendMfaCallbackUrl` (frontend MFA challenge page).
- **`../oauth/mfa-redirect.ts`** — `createMfaChallengeCookie` sets the challenge + expiry on the response before redirecting to the MFA page.
- **`../services/index.ts`** (and `../services/oauth.ts`) — `loginOrCreateFromOAuth` performs the find-or-create; `recordOAuthFailure` audits failures; `twoFactorService.buildLoginChallenge` produces the MFA challenge; `OAuthEmailUnverifiedError` / `OAuthAccountUnverifiedError` are distinct catch branches.
- **`../session/session.ts`** — `issueSession` mints the session cookie on the success path.
- **`../session/login-observability.ts`** — `recordLoginSuccess` logs an `AUTH_LOGIN` event, but only when `outcome === 'login'` (not `link` or `signup`).
- **`../metrics.ts`** — `authOauthTotal` counter labelled by `provider` and `status` (`success` | `failure` | `mfa_required`).
- **`../roles.ts`** — `isUnrestrictedCaller` determines whether to tag the login-observability record with the unrestricted flag.
- **`@infrastructure/http/response.ts`** — `rejectResponse` for the two JSON 4xx paths (unknown provider, bad state/verifier).
- **`@infrastructure/http/request.ts`** — `callerContextOf` extracts the audit context (IP, UA, etc.) for logging/metrics.
- **`@infrastructure/i18n/index.ts`** / **`@infrastructure/i18n/context.ts`** — `t` provides user-facing error strings.
- **`@infrastructure/adapters/logger.ts`** — `logger.error` logs the provider/exchange detail on unexpected errors.
- **`@kernel/cookies.ts`** — `cookieOf` reads a single cookie value from the request.
- **`../routes.ts`** — registers this controller on the `GET /account/oauth/:provider/callback` route.

## Notes

- **JSON only for the two pre-validation 4xx paths.** Once state is trusted, every failure is a 302 to the frontend with `?error=<code>` because the browser is already mid-navigation and cannot read a JSON body.
- **PKCE is mandatory.** A missing or empty verifier cookie returns 400 rather than falling through to an exchange without a verifier — a provider that never received a challenge will happily accept a verifier-less exchange, so the two cases must not share a branch.
- **`continue` cookie is re-validated at the callback.** It is read only *after* state verification (so a forged state cannot steer a stranger's browser) and checked with `isSameOriginPath` because cookies are client-writable.
- **`AUTH_LOGIN` is recorded only when `outcome === 'login'`.** The `link` and `signup` paths already emit their own audit events inside `loginOrCreateFromOAuth`; recording a second `AUTH_LOGIN` would double-count.
- **2FA is account-level, not method-level.** Even a successful OAuth exchange is blocked into an MFA challenge if `user.twoFactorEnabledAt` is set; issuing a session directly would let the provider substitute for the second factor.
- **`OAuthEmailUnverifiedError` vs `OAuthAccountUnverifiedError`** map to distinct frontend error codes (`email_unverified` vs `account_unverified`) because the remediation differs: verify with the provider vs. reset the password on the existing account.
- **Stryker mutation-testing suppression** wraps the `logger.error` call in the catch-all — intentional, not a mistake.
