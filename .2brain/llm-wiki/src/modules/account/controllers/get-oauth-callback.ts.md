---
source: src/modules/account/controllers/get-oauth-callback.ts
sha256: d9e05547a3c3dcf9ec9e910c5401e68590175c0ebb8d7fc36062bc17ee77206a
generated_at: 2026-11-08T04:01:52.344385+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/get-oauth-callback.ts

## Purpose

Controller for `GET /account/oauth/:provider/callback` — the URL a provider's consent screen redirects the browser back to. Validates the CSRF `state` against a cookie, exchanges the authorization code (with PKCE verifier), then either finds-or-creates an account and mints a session, or links the identity to an already-signed-in account ("connect" flow). All failures after state validation surface as 302 redirects back to the frontend with `?error=<code>`, because the browser is mid-navigation and a JSON body is unreadable.

## Key elements

- **`getOAuthCallback`** (exported) — the Express handler. Resolves the provider by name, validates `state`, checks for a missing PKCE verifier, branches into connect-vs-login, exchanges the code, and orchestrates session minting / MFA challenge / deletion-pending redirect.
- **`clearOAuthCookies`** (module-private) — destroys all five single-attempt cookies (state, verifier, continue, locale, link). Called on every terminal outcome.
- **`signedInUserId`** (module-private) — reads the session cookie and resolves it to a user id via `resolveCookie`. Needed because in `jwt` mode the global middleware does not populate the request caller from the cookie.
- **`recordFailureAndClear` / `failToFrontend`** (closures inside the handler) — shared failure tail: audit + metric increment + cookie clear, then either a 400 JSON (for state/verifier) or a 302 to the frontend with an error code.
- **`savedLocale`** (closure) — lazily reads the saved locale cookie, re-validating with `isLocaleTag` before trusting it.

## Relationships

- **`../oauth/state.ts`** — source of all five cookie name constants, `stateMatches`, the `destroy*Cookie` helpers, `isSameOriginPath`, and `isLocaleTag`. Every cookie read/destroy in this file goes through this module.
- **`../oauth/config.ts`** — provides `oauthCallbackUrl` (the redirect URI passed to the provider), `oauthFrontendCallbackUrl`, `oauthFrontendMfaCallbackUrl`, `oauthFrontendDeletionCallbackUrl`, and the `OAuthCallbackError` union type used for frontend-facing error codes.
- **`../oauth/providers/index.ts`** — `resolveOAuthProvider` looks up the provider adapter by name; the handler then calls `provider.exchangeCode` on it.
- **`../oauth/mfa-redirect.ts`** — `createMfaChallengeCookie` is set when the account has 2FA enabled, sending the browser to the MFA challenge instead of a session.
- **`../oauth/deletion-redirect.ts`** — `createDeletionChallengeCookie` is set in the deletion-grace branch so the frontend can offer restore.
- **`../services`** (not in neighbor list but imported) — `accountService` (loginOrCreateFromOAuth, linkProviderToSignedInAccount, recordOAuthFailure, buildDeletionPending), `twoFactorService`, and the OAuth-specific error classes (`OAuthIdentityTakenError`, `OAuthLinkExpiredError`, etc.).
- **`../session/session`** — `issueSession` mints the session on successful login.
- **`../session/login-observability`** — `recordLoginSuccess` writes the audit row (only for genuine logins, not links/signups).
- **`../session/device-cookie`** — `rememberDevice` sets the completed-login cookie.
- **`@modules/users`** — `isRestorable` determines whether the account is in its deletion grace period.
- **`src/infrastructure/http/cookies.ts`** — `cookieOf` reads request cookies.
- **`src/infrastructure/http/request.ts`** — `callerContextOf` extracts the audit context (IP, UA, etc.).
- **`src/infrastructure/http/response.ts`** — `rejectResponse` for the 404 / 400 JSON responses.
- **`src/infrastructure/adapters/logger.ts`** — `logger.error` on unexpected connect-callback failures.
- **`src/infrastructure/i18n/index.ts`** — `t` for localised error messages.
- **`src/kernel/authentication.ts`** — `resolveCookie` turns a session token into a user object.
- **`src/kernel/cookies.ts`** — `readSessionCookie` extracts the raw session token from the request.
- **`src/modules/account/metrics.ts`** — `authOauthTotal` Prometheus counter, incremented on success / failure / deletion_pending.
- **`src/modules/account/routes.ts`** — wires this handler to the `GET /account/oauth/:provider/callback` route.

## Notes

- Only three HTTP outcomes reach the client: **404** (unknown provider), **400** (bad state or missing PKCE verifier), **302** (everything else — success, MFA, deletion, or provider-level failure). Post-state failures never produce a JSON body.
- The `continue` and `locale` cookies are re-validated (`isSameOriginPath`, `isLocaleTag`) *after* state is trusted. They are client-writable, so their values are never trusted on the strength of the cookie name alone.
- A missing PKCE verifier fails closed with a 400 rather than silently exchanging the code without a challenge — "no cookie" and "no PKCE" must never share a code path.
- The **connect flow** (link cookie present) never mints a session; it links the provider identity to the already-signed-in account and redirects back to the saved `continue` path.
- **MFA is a control on the account, not the login method.** An OAuth login is blocked by the MFA challenge if the account has 2FA armed, even though no password was involved.
- The **deletion grace** branch mints no session; the frontend receives a restore offer via the deletion-callback redirect.
- `recordLoginSuccess` (audit) is called **only** for a genuine login outcome — `link` and `signup` already record their own audit events inside `loginOrCreateFromOAuth`, so a second `AUTH_LOGIN` row would double-count.
- `provedAt` is captured *before* the code exchange; a password change during the exchange must refuse the login.
- Stryker mutation-testing annotations (`// Stryker disable all` / `restore all`) wrap the catch-all error branch in the connect flow.
