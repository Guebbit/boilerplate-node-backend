---
source: src/modules/account/controllers/get-oauth-callback.ts
sha256: 749f60becb28d73373214d018c9a6762bc39e6f1431c10ffeec880348cefdc71
generated_at: 2026-10-29T02:27:12.767892+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/get-oauth-callback.ts

## Purpose

Handler for `GET /account/oauth/:provider/callback` — the endpoint a provider's consent screen redirects the browser back to. It validates the CSRF `state` and PKCE verifier, exchanges the authorization code, then either links the identity to an already-signed-in account or finds/creates an account and mints a session. Every failure after `state` is trusted is communicated via a 302 redirect carrying `?error=<code>` because the browser is mid-navigation and cannot read a JSON body.

## Key elements

- **`getOAuthCallback`** (exported) — the Express route handler. Orchestrates the full callback: provider lookup → state check → verifier check → code exchange → login-or-link → session issuance (or MFA / deletion-challenge cookie). Returns `Promise<void>` via chained `.then/.catch`.
- **`clearOAuthCookies(response)`** (module-private) — destroys all five single-attempt OAuth cookies (`state`, `verifier`, `continue`, `locale`, `link`). Called on every terminal path (success and failure) because none survive the callback.
- **`signedInUserId(request)`** (module-private) — resolves the current session's user ID by reading the session cookie and calling `resolveCookie`. Needed because in `jwt` mode the global middleware does not populate `req`'s caller from a refresh-token cookie.
- **`savedLocale()`** (closure inside handler) — lazily reads and validates the `OAUTH_LOCALE_COOKIE` for use in frontend redirect URLs.
- **`recordFailureAndClear(reason)`** (closure) — audit log + `authOauthTotal` metric increment + `clearOAuthCookies`. Shared tail for all failure branches.
- **`failToFrontend(reason)`** (closure) — calls `recordFailureAndClear`, then issues a 302 to the frontend callback URL with `?error=<reason>`.

## Relationships

- **`@kernel/authentication` / `@kernel/cookies`** — `resolveCookie` + `readSessionCookie` resolve the session token to a user ID for the link path.
- **`@infrastructure/http/cookies`** — `cookieOf` reads all OAuth cookies from the request (state, verifier, continue, locale, link).
- **`@infrastructure/http/request`** — `callerContextOf` extracts the audit context (IP, user-agent, etc.) passed to service-layer recorders.
- **`@infrastructure/http/response`** — `rejectResponse` produces the 404 (unknown provider) and 400 (bad state/verifier) JSON responses.
- **`@infrastructure/i18n`** — `t()` provides localized error messages for the 400/404 responses.
- **`@infrastructure/adapters/logger`** — `logger.error` logs unexpected failures in the link path.
- **`../oauth/state`** — `stateMatches` (timing-safe comparison), the five `destroy*Cookie` helpers, `isSameOriginPath`, `isLocaleTag`, and the cookie-name constants.
- **`../oauth/providers`** — `resolveOAuthProvider` maps the URL param to a provider object; the provider's `exchangeCode` performs the token exchange.
- **`../oauth/config`** — `oauthCallbackUrl`, `oauthFrontendCallbackUrl`, `oauthFrontendMfaCallbackUrl`, `oauthFrontendDeletionCallbackUrl` build the redirect targets.
- **`../oauth/mfa-redirect`** — `createMfaChallengeCookie` sets the cookie that carries the MFA challenge to the frontend.
- **`../oauth/deletion-redirect`** — `createDeletionChallengeCookie` sets the cookie for the deletion-grace restore flow.
- **`../metrics`** — `authOauthTotal` Prometheus counter incremented on success, failure, and deletion-pending outcomes.
- **`../routes`** — registers `getOAuthCallback` as the handler for `GET /account/oauth/:provider/callback`.

## Notes

- **Fail-closed PKCE:** a missing or empty verifier cookie is a hard 400. The code explicitly avoids sharing the "no cookie" branch with "skip PKCE," because a provider that received no challenge will accept an exchange with no verifier.
- **Re-validation of client-writable cookies:** `continue` and `locale` are re-validated (`isSameOriginPath`, `isLocaleTag`) *after* state is trusted, because cookies are trivially forged; the name alone is never sufficient.
- **`provedAt` timing:** captured before `exchangeCode` so that a password change during the exchange window can be detected downstream and the login refused.
- **Audit deduplication:** only a genuine `login` outcome records `AUTH_LOGIN`; the `link` and `signup` sub-paths already audit themselves inside `loginOrCreateFromOAuth`, preventing double-counting.
- **2FA is account-level:** `twoFactorEnabledAt` is checked even on the OAuth path. Minting a session without honoring it would let a provider bypass a second factor the user deliberately armed.
- **Link path never mints a session:** the connecting account is already signed in; the callback only attaches the new identity and redirects back.
- **Stryker markers** (`// Stryker disable all` / `restore`) bracket the `logger.error` call in the link-path catch, indicating the mutation-testing suite suppresses mutations there (the `failToFrontend` fallback is the behavior under test).
