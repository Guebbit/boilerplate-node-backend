---
source: src/modules/account/controllers/post-oauth-link-start.ts
sha256: b29b7c97953caa17fbcfaac4b842b2ec000648c54555c6c5a7c0acc3f7172176
generated_at: 2026-11-08T04:06:19.007213+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-oauth-link-start.ts

## Purpose

Handler for `POST /account/oauth/links/{provider}` — the signed-in flow for connecting an external sign-in provider to the caller's account. It mints the OAuth state and PKCE verifier, obtains a link token from the account service, sets all of them (plus optional `continue`/`locale`) as cookies, and responds with the provider's authorization URL for the client to navigate to.

## Key elements

- **`postOAuthLinkStart(request, response)`** — sole export. Resolves the provider by name (lowercased), calls `accountService.startOAuthLink(authContext.id)` to get a link token, generates state + code verifier, writes the five cookies, and returns `{ authorizeUrl }` via `successResponse`. Returns 404 with an i18n error for unknown providers.

## Relationships

- **`../oauth/providers/index.ts`** — calls `resolveOAuthProvider` to map the URL param to a concrete provider object (used for `authorizeUrl(...)`).
- **`../oauth/state.ts`** — source of all PKCE/state helpers: `generateOAuthState`, `generateCodeVerifier`, `codeChallengeOf`, and the cookie setters (`createStateCookie`, `createVerifierCookie`, `createLinkCookie`, `createContinueCookie`, `createLocaleCookie`) plus the validators `isSameOriginPath` / `isLocaleTag`.
- **`../oauth/config.ts`** — supplies `oauthRedirectUri(provider.name)` passed as the redirect URI in the authorize URL.
- **`../services/index.ts`** — calls `accountService.startOAuthLink(accountId)` to obtain the link token.
- **`@infrastructure/http/response.ts`** — `successResponse` / `rejectResponse` shape the JSON replies.
- **`@infrastructure/http/controller.ts`** — `catchAs` is the standard error-boundary wrapper for the Promise chain.
- **`@infrastructure/i18n/index.ts`** — `t('account.oauth.unknown-provider')` localises the 404 message.
- **`../routes.ts`** — mounts this handler at the `POST /account/oauth/links/:provider` path with a fresh-session guard (noted in the file's module doc-comment).

## Notes

- The route requires a **fresh (non-reused) session**; the guard is applied at the route level, not inside this controller. `request.authContext!.id` is therefore always present.
- `?continue=` and `?locale=` are only honoured if they pass `isSameOriginPath` / `isLocaleTag` respectively — malformed values are silently ignored (no cookie set), not rejected.
- The response is JSON (unlike the analogous `GET /account/oauth/:provider` login flow which issues a 302 redirect). The client is expected to `window.location.assign(authorizeUrl)` itself.
- Error handling is delegated entirely to `catchAs`; there is no inline `try/catch`.
