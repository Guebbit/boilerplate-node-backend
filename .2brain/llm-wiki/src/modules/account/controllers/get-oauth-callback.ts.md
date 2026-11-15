---
source: src/modules/account/controllers/get-oauth-callback.ts
sha256: 5afd253296032039dd43a7f3694c8b3770908413df0bebd34804240a7c08db0e
generated_at: 2026-11-14T18:31:57.697606+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/get-oauth-callback.ts

## Purpose

Handler for `GET /account/oauth/:provider/callback` — the endpoint an OAuth provider's consent screen redirects the browser back to. It validates the CSRF `state` and PKCE verifier, exchanges the authorization code with the provider, then either links the identity to an already-signed-in account (connect flow) or finds-or-creates a user and issues a session (login flow). Exactly three response shapes reach the caller: 404 (unknown provider), 400 (state/verifier mismatch), or 302 back to the frontend (everything else, with `?error=<code>` appended for failures).

## Key elements

- **`getOAuthCallback`** (exported) — The sole Express handler. Sequences: provider lookup → state check → verifier check → error/code inspection → link-vs-login branch → code exchange → session issuance or frontend redirect.
- **`clearOAuthCookies`** (internal) — Destroys all five single-use OAuth cookies (state, verifier, continue, locale, link). Called at every terminal outcome so no stale value survives one attempt.
- **`signedInUserId`** (internal) — Resolves the current user ID from the session cookie via `resolveCookie`. Needed because in `jwt` mode the global middleware does not populate `request`'s caller from a cookie, so reading the request's own caller would miss a live session.

## Relationships

- **`src/modules/account/oauth/state.ts`** — Supplies `stateMatches`, all five `destroy*Cookie` helpers, `isSameOriginPath`, `isLocaleTag`, and the cookie-name constants this controller reads and destroys.
- **`src/modules/account/oauth/providers/index.ts`** — `resolveOAuthProvider` maps the `:provider` param to a provider object whose `exchangeCode` method is called with the callback URL and PKCE verifier.
- **`src/modules/account/oauth/config.ts`** — Provides `oauthCallbackUrl`, `oauthFrontendCallbackUrl`, `oauthFrontendMfaCallbackUrl`, `oauthFrontendDeletionCallbackUrl`, and the `OAuthCallbackError` type used in redirect `?error=` params.
- **`src/modules/account/oauth/mfa-redirect.ts`** — `createMfaChallengeCookie` is set when the account has 2FA armed, redirecting to the frontend MFA challenge page.
- **`src/modules/account/oauth/deletion-redirect.ts`** — `createDeletionChallengeCookie` is set during the deletion-grace period, redirecting to the frontend restore page.
- **`src/kernel/authentication.ts`** — `resolveCookie` turns the session token into a user object (used by `signedInUserId`).
- **`src/kernel/cookies.ts`** — `readSessionCookie` extracts the session token from the request.
- **`src/infrastructure/http/cookies.ts`** — `cookieOf` is the generic cookie reader for all five OAuth cookies.
- **`src/infrastructure/http/response.ts`** — `rejectResponse` emits the 404/400 JSON bodies.
- **`src/infrastructure/http/request.ts`** — `callerContextOf` provides the audit context passed to `recordOAuthFailure` and service calls.
- **`src/infrastructure/i18n/index.ts`** — `t` localizes the two JSON error messages.
- **`src/infrastructure/adapters/logger.ts`** — Used for error logging on unexpected (non-domain) failures in the connect branch.
- **`src/modules/account/metrics.ts`** — `authOauthTotal` incremented with `status: 'success' | 'failure' | 'deletion_pending'`.
- **`src/modules/account/routes.ts`** — Registers this handler on the `GET /account/oauth/:provider/callback` route.

## Notes

- **Error-response convention:** JSON bodies (404, 400) are only used *before* the provider round-trip. Once the browser is mid-navigation (code-exchange stage onward), all failures are 302 redirects carrying `?error=<code>` — a JSON body would be unreadable at that point.
- **Credential-budget flag:** `request.credentialAttemptFailed = true` is set on every 302-failure so the rate-limiting middleware counts the redirect (which otherwise looks like a 2xx) as a failed attempt.
- **PKCE fails closed:** A missing or empty verifier cookie returns 400. The comment notes that some providers will happily accept a code exchange with *no* verifier, so "no cookie" and "no PKCE" must never be conflated.
- **`provedAt` timing:** Captured as `Date.now()` *before* `exchangeCode` so that a password change mid-exchange can invalidate the session.
- **Stryker markers:** The logger call in the connect-catch branch is wrapped in `Stryker disable/restore all` to suppress mutation testing on that non-domain log path.
