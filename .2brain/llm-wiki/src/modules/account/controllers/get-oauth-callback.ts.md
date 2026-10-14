---
source: src/modules/account/controllers/get-oauth-callback.ts
sha256: 883831925466c337e4aa6361d56a061adc8db9baa5777b3ad3a43b7d5ab42a0b
generated_at: 2026-10-14T08:31:21.970957+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/get-oauth-callback.ts

## Purpose

Handles `GET /account/oauth/:provider/callback` — the endpoint a browser lands on after the provider's consent screen. Validates the CSRF state cookie, exchanges the authorization code (with PKCE), resolves or creates the account, and either mints a session and redirects to the paired frontend, or redirects back with `?error=<code>`. By the time any post-state error occurs the browser is mid-navigation, so all failures are 302s to the frontend rather than JSON bodies.

## Key elements

- **`getOAuthCallback(request, response)`** — the sole export; the Express handler for the callback route. Orchestrates state validation → code exchange → account resolution → session issuance (or MFA challenge) → redirect.
- **`clearOAuthCookies(response)`** — internal helper; destroys all four single-attempt cookies (`state`, `verifier`, `continue`, `locale`). Called on every terminal path so no cookie outlives one attempt.
- **`savedLocale()`** — internal helper; lazily reads and locale-tag-validates the saved-locale cookie.
- **`recordFailureAndClear(reason)`** — internal helper; records the audit event, increments the failure metric, and clears cookies.
- **`failToFrontend(reason)`** — internal helper; wraps `recordFailureAndClear` + a 302 to the frontend callback URL with `?error=<reason>`.

## Relationships

- **`src/modules/account/oauth/state.ts`** — supplies `stateMatches`, the four `destroy*Cookie` functions, `isSameOriginPath`, `isLocaleTag`, and the cookie-name constants used throughout.
- **`src/modules/account/oauth/providers/index.ts`** — `resolveOAuthProvider` maps the URL param to a provider object exposing `exchangeCode`.
- **`src/modules/account/oauth/config.ts`** — provides `oauthCallbackUrl` (the server-side redirect URI for code exchange) and the two frontend redirect URL builders.
- **`src/modules/account/oauth/mfa-redirect.ts`** — `createMfaChallengeCookie` sets the challenge cookie when the account has 2FA enabled.
- **`src/modules/account/services/index.ts`** — re-exports `loginOrCreateFromOAuth`, `recordOAuthFailure`, `twoFactorService`, and the three typed `OAuth*Error` classes.
- **`src/modules/account/session/session.ts`** — `issueSession` mints the session on the success path.
- **`src/modules/account/session/login-observability.ts`** — `recordLoginSuccess` fires only when `outcome === 'login'` (not `link`/`signup`).
- **`src/modules/account/roles.ts`** — `isUnrestrictedCaller` determines the role recorded in the success audit.
- **`src/modules/account/metrics.ts`** — `authOauthTotal` counter incremented with `{ provider, status: 'success' | 'failure' | 'mfa_required' }`.
- **`src/infrastructure/http/response.ts`** — `rejectResponse` for the two synchronous 4xx paths (unknown provider, bad state/verifier).
- **`src/infrastructure/http/cookies.ts`** — `cookieOf` reads the four OAuth cookies.
- **`src/infrastructure/http/request.ts`** — `callerContextOf` extracts audit context.
- **`src/infrastructure/i18n/index.ts`** — `t` localises the 400/404 error strings.
- **`src/infrastructure/adapters/logger.ts`** — `logger.error` logs unexpected (non-typed) failures.
- **`src/modules/account/routes.ts`** — registers this handler on the `GET /account/oauth/:provider/callback` route.

## Notes

- **Fail-closed PKCE:** a missing or empty verifier cookie is a hard 400, never a silent skip. A provider that received no PKCE challenge will happily accept an exchange with no verifier, so the code explicitly guards against that.
- **Re-validation of `continue` and `locale` cookies:** both are re-validated (`isSameOriginPath`, `isLocaleTag`) *after* state is trusted. The comment makes clear this is because cookies are client-writable and must not be trusted by name alone.
- **2FA is account-level, not method-level:** if `user.twoFactorEnabledAt` is set, the OAuth code exchange is discarded and the user is redirected to the MFA challenge flow. A session is never minted for a 2FA-armed account via any single method.
- **`recordLoginSuccess` guard:** fires only when `outcome === 'login'`. The `link` and `signup` outcomes already self-audit inside `loginOrCreateFromOAuth`, so recording them again would double-count.
- **`OAuthAccountUnavailableError` → `provider_error`:** banned/soft-deleted accounts are indistinguishable from a generic provider failure to prevent state leakage. Deliberately not logged as an error.
- **Stryker markers:** the `logger.error` block is wrapped in `Stryker disable all` / `restore all` comments, suppressing mutation testing on that line.
- **Synchronous vs. asynchronous failures:** the two 400 paths (invalid state, missing verifier) and the 404 (unknown provider) use `rejectResponse` with a JSON body because the browser hasn't started navigation yet. Every downstream failure uses `failToFrontend` (302 + query param) because the browser is already mid-redirect and a response body would be unreadable.
