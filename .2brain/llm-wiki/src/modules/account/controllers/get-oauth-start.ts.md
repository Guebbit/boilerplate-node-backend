---
source: src/modules/account/controllers/get-oauth-start.ts
source_sha256: f0d088472acd41523cedfbbab1205c35fed8ce4f93ca400b632a33250f3b05d5
context_sha256: a7e8752f32eee3935ff913253c7c174c9dc4c29ec45ab5b949e3f359b046e40d
generated_at: 2026-11-22T03:21:51.928368+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/controllers/get-oauth-start.ts

## Purpose
Controller for `GET /account/oauth/:provider`. It starts an OAuth login by setting the cookies the callback will need and redirecting (302) the browser to the provider's consent screen. Unlike the other routes in this module, it answers with a redirect rather than a JSON envelope.

## Key elements
- `getOAuthStart(request, response)` — the only export. Its flow:
  1. Lowercases `:provider` and resolves it with `resolveOAuthProvider`. An unknown provider gets a 404 through `rejectResponse`, with the message `t('account.oauth.unknown-provider')`.
  2. Generates the CSRF `state` with `generateOAuthState` and stores it with `createStateCookie`.
  3. Generates the PKCE verifier with `generateCodeVerifier` and stores it with `createVerifierCookie`.
  4. If `?continue=` passes `isSameOriginPath`, saves it with `createContinueCookie`.
  5. If `?locale=` passes `isLocaleTag`, saves it with `createLocaleCookie`.
  6. Builds the authorize URL with `provider.authorizeUrl(state, oauthRedirectUri(provider.name), codeChallengeOf(verifier))` and redirects with `response.redirect(302, ...)`.

## Relationships
- `src/infrastructure/http/response.ts` — provides `rejectResponse`, used for the 404 on an unknown provider.
- `src/infrastructure/i18n/index.ts` — provides `t`, which translates the unknown-provider error message.
- `src/infrastructure/i18n/context.ts` — not imported directly; no interaction is visible in this file.
- `src/modules/account/oauth/providers/index.ts` — provides `resolveOAuthProvider`. The provider it returns is used for its `authorizeUrl` method and for the name passed to `oauthRedirectUri`.
- `src/modules/account/oauth/state.ts` — provides the state, verifier and challenge generators, the four cookie creators, and the `isSameOriginPath` and `isLocaleTag` validators.
- `src/modules/account/oauth/config.ts` — provides `oauthRedirectUri`, which supplies the redirect URI sent to the provider.
- `src/modules/account/routes.ts` — not imported here. By the module's convention it is where this controller is mounted on the route.

## Notes
- An invalid or missing `continue` or `locale` value is dropped silently rather than rejected. The route only answers a browser navigation, so there is nowhere to show a JSON error.
- The 404 for an unknown provider is deliberate. A deployment that never configured a provider must not pretend it exists.
- `continue` is accepted only as a same-origin relative path, which guards against open redirects after login.
- The `locale` cookie lets a visitor on a page like `/it/login` return in Italian.
- Only the PKCE challenge, derived from the verifier, is sent to the provider. The verifier itself stays in the cookie.
