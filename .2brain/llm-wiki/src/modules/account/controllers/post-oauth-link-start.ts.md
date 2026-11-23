---
source: src/modules/account/controllers/post-oauth-link-start.ts
source_sha256: b29b7c97953caa17fbcfaac4b842b2ec000648c54555c6c5a7c0acc3f7172176
context_sha256: f0465efcc4980b5bb52728ae61da385461c36541b626819f865e94378353b3fd
generated_at: 2026-11-22T03:26:05.678810+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/controllers/post-oauth-link-start.ts

## Purpose
Controller for `POST /account/oauth/links/{provider}`. It starts connecting a sign-in provider to the caller's own, already signed-in account. Unlike the login-style `GET /account/oauth/:provider`, it answers JSON. The client receives an `authorizeUrl` and navigates the browser to it. The cookies set here are what the OAuth callback relies on when the browser returns from the provider.

## Key elements
- `postOAuthLinkStart(request, response)` is the only export, an Express handler. Its steps:
  1. Resolves the provider from `request.params.provider`, lowercased, using `resolveOAuthProvider`. An unknown provider gets a 404 via `rejectResponse` with `t('account.oauth.unknown-provider')`.
  2. Calls `accountService.startOAuthLink(request.authContext!.id)` to obtain a link token.
  3. Generates the OAuth state and a PKCE code verifier, then sets state, verifier and link-token cookies.
  4. Optionally sets a continue cookie, only if `?continue=` passes `isSameOriginPath`.
  5. Optionally sets a locale cookie, only if `?locale=` passes `isLocaleTag`.
  6. Replies with `successResponse(response, { authorizeUrl })`. The URL comes from `provider.authorizeUrl(state, oauthRedirectUri(provider.name), codeChallengeOf(verifier))`.
  7. Wraps errors with `catchAs(response, 'postOAuthLinkStart')`.

## Relationships
- `src/modules/account/oauth/providers/index.ts`: `resolveOAuthProvider` supplies the provider object, which builds the consent URL.
- `src/modules/account/oauth/state.ts`: supplies state and verifier generation, the PKCE challenge, all cookie creators (state, verifier, link, continue, locale), and the `isSameOriginPath` and `isLocaleTag` validators.
- `src/modules/account/oauth/config.ts`: `oauthRedirectUri` gives the callback URL for the provider.
- `src/modules/account/services/index.ts`: exports `accountService`, whose `startOAuthLink` issues the token that names the account being linked.
- `src/infrastructure/http/response.ts` and `src/infrastructure/http/controller.ts`: `rejectResponse` and `successResponse` produce the responses, and `catchAs` handles errors.
- `src/infrastructure/i18n/index.ts`: `t` translates the 404 message.
- `src/modules/account/routes.ts` mounts this handler. The doc comment says the route applies the fresh-session guard.

## Notes
- The handler relies on `request.authContext!` being populated, so it only works behind the route's auth guard.
- The unknown-provider branch returns `Promise.resolve()` so the handler always returns a promise.
- The continue and locale values are passed through only if they validate. Invalid values are silently ignored, not rejected.
