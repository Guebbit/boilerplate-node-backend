---
source: src/modules/account/controllers/get-oauth-callback.ts
source_sha256: cd631006ccbb0e8784fb46d8f8c76d62565897a22d5d85b37dbd7364367fe7ca
context_sha256: 18bd6a3f19800ba08e64b42a4969e98ab9139d8119b51f308d94eb91e62c1b02
generated_at: 2026-11-22T03:21:33.622138+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/controllers/get-oauth-callback.ts

## Purpose
Express controller for `GET /account/oauth/:provider/callback`, the URL a provider's consent screen redirects the browser back to. It validates the CSRF state, exchanges the authorization code (with PKCE), then either links the identity to a signed-in account or logs in or creates an account. Only three outcomes reach the caller directly: a 404 for an unconfigured provider, a 400 for a bad state or verifier, or a 302 to the frontend. All other failures redirect to the frontend with `?error=<code>`, because the browser is mid-navigation and cannot read a JSON body.

## Key elements
- `getOAuthCallback(request, response)` is the exported controller. Its flow:
  1. Resolve the provider with `resolveOAuthProvider`. Return 404 if it is unknown.
  2. Check `stateMatches` against the state cookie. On mismatch, record the failure and return 400 `invalid_state`.
  3. Read the `continue` path from its cookie and keep it only if `isSameOriginPath` accepts it. This happens only after state is trusted.
  4. Require a non-empty PKCE verifier cookie. If it is missing, fail closed with 400 `invalid_verifier`.
  5. Redirect with `access_denied` if the provider sent `error`, or with `provider_error` if there is no `code`.
  6. Capture `provedAt = Date.now()` before the code exchange. A password change that lands while the exchange runs must refuse this login.
  7. Take the **link branch** if the link cookie is present, otherwise the **login branch**.
- Link branch: calls `exchangeCode`, then `signedInUserId`, then `linkProviderToSignedInAccount`. It mints no session. On success it redirects to the frontend with the provider name and `continue` path. Error mapping:
  - `OAuthIdentityTakenError` → `already_linked`
  - `OAuthLinkExpiredError` → `link_expired`
  - `OAuthAccountUnavailableError` → `provider_error`
  - Anything else is logged and redirected as `provider_error`.
- Login branch: calls `exchangeCode`, then `loginOrCreateFromOAuth`. The login branch is cut off in the provided source, so its handling after the code exchange is only partly visible:
  - If the user has no `twoFactorEnabledAt`:
    - If the user is restorable under the deletion grace (`isRestorable`), it builds a deletion-pending challenge with `buildDeletionPending`, sets the deletion challenge cookie, and redirects via `oauthFrontendDeletionCallbackUrl`. It increments the `deletion_pending` metric. No session is issued.
    - Otherwise it calls `issueSession` with `amr: [provider.name]` and `provedAt`.
  - Imports for `createMfaChallengeCookie`, `buildLoginChallenge`, `recordLoginSuccess`, `rememberDevice` and `oauthFrontendMfaCallbackUrl` indicate MFA and login-observability handling elsewhere in the login branch.
- `clearOAuthCookies` destroys the five single-attempt cookies: state, verifier, continue, locale and link.
- `signedInUserId` resolves the signed-in user id from the session cookie via `readSessionCookie` and `resolveCookie`. It returns `undefined` if there is no live session.
- Local closures:
  - `savedLocale` returns the locale cookie only if `isLocaleTag` accepts it.
  - `recordFailureAndClear` calls `accountService.recordOAuthFailure`, increments the failure metric and clears the cookies.
  - `failToFrontend` sets `request.credentialAttemptFailed = true`, calls `recordFailureAndClear`, then does a 302 to `oauthFrontendCallbackUrl(reason, undefined, savedLocale())`.

## Relationships
- `infrastructure/http/response` (`rejectResponse`) is used for the 404/400 JSON responses, and `infrastructure/i18n` (`t`) translates the messages.
- `infrastructure/http/request` (`callerContextOf`) supplies the caller context for audit and service calls.
- `infrastructure/http/cookies` (`cookieOf`) reads the OAuth cookies.
- `infrastructure/adapters/logger` records unexpected link-callback errors.
- `kernel/authentication` (`resolveCookie`) and `kernel/cookies` (`readSessionCookie`) identify the signed-in account.
- `oauth/providers` provides `resolveOAuthProvider` and the provider's `exchangeCode`.
- `oauth/state` provides the state, verifier, continue, locale and link cookie names, the matching and validation helpers, and the cookie destroyers.
- `oauth/config` builds the callback and frontend redirect URLs and defines the `OAuthCallbackError` type.
- `oauth/mfa-redirect` and `oauth/deletion-redirect` create the MFA and deletion challenge cookies.
- `metrics` supplies the `authOauthTotal` counter.
- `../services` supplies `accountService` and the OAuth error classes. `../services/oauth`, `deletion-sign-in` and `two-factor-challenge` supply the link, login, deletion and challenge logic.
- `../session/*` supplies `issueSession`, `recordLoginSuccess` and `rememberDevice`. `@modules/users` supplies `isRestorable`.
- `routes.ts` mounts this controller.

## Notes
- The cookies are client-writable, so `continue` and locale are re-validated before use. `continue` is only read once state is verified.
- A 302 would look like a success to the credential rate budgets. `failToFrontend` therefore sets `credentialAttemptFailed` so the attempt is counted as a failure.
- The callback does not mint an access token. The frontend's `POST /account/refresh` bootstrap does that after the redirect.
- `signedInUserId` resolves the session explicitly because in `jwt` mode the global middleware does not populate the caller from the cookie, which holds a refresh token there.
- 2FA is treated as an account-level control. A provider login must not bypass a second factor the owner enabled.
- Cookies are cleared on every outcome of an attempt.
