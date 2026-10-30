---
source: src/modules/account/controllers/post-oauth-link-start.ts
sha256: b29b7c97953caa17fbcfaac4b842b2ec000648c54555c6c5a7c0acc3f7172176
generated_at: 2026-10-29T02:31:06.655506+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/post-oauth-link-start.ts

## Purpose

POST controller for `/account/oauth/links/{provider}` that initiates the "connect a provider to my existing account" flow. Unlike the sign-in `GET` route, it returns JSON (an `authorizeUrl`) to a signed-in client and sets the session cookies (OAuth state, PKCE verifier, link token, optional continue/locale) that the callback will trust when the browser returns from the provider.

## Key elements

- **`postOAuthLinkStart(request, response)`** — The sole export. Resolves the provider name, calls `accountService.startOAuthLink(accountId)` to mint a link token, generates state + PKCE verifier, sets all cookies, and responds with `{ authorizeUrl }`.
- **Provider resolution** — `resolveOAuthProvider(provider.toLowerCase())`; returns a 404 JSON error (i18n key `account.oauth.unknown-provider`) when the name is unrecognised.
- **Cookie minting** — `createStateCookie`, `createVerifierCookie`, `createLinkCookie` are always set; `createContinueCookie` and `createLocaleCookie` are set conditionally when the corresponding query params pass validation (`isSameOriginPath` / `isLocaleTag`).
- **Error boundary** — All async failures are funneled through `catchAs(response, 'postOAuthLinkStart')`.

## Relationships

- **`src/modules/account/routes.ts`** — Registers this handler at the `POST /account/oauth/links/:provider` path and mounts an auth/session guard before the controller runs.
- **`src/modules/account/services/index.ts`** — `accountService.startOAuthLink(id)` is the only service call; it validates the session and returns the link token.
- **`src/modules/account/oauth/state.ts`** — Supplies all cookie helpers, PKCE utilities (`generateCodeVerifier`, `codeChallengeOf`), state generation, and query-param validators.
- **`src/modules/account/oauth/config.ts`** — `oauthRedirectUri(providerName)` provides the absolute callback URL embedded in the `authorizeUrl`.
- **`src/modules/account/oauth/providers/index.ts`** — `resolveOAuthProvider` maps the URL param to a provider object that exposes `authorizeUrl(state, redirectUri, codeChallenge)`.
- **`src/infrastructure/http/response.ts`** — `successResponse` / `rejectResponse` shape the JSON reply.
- **`src/infrastructure/http/controller.ts`** — `catchAs` wraps the promise chain into a standard 500 envelope.
- **`src/infrastructure/i18n/index.ts`** — `t()` localises the unknown-provider error message.

## Notes

- The handler is **synchronous-looking but returns a Promise** (the `.then` chain). The early-404 path returns `Promise.resolve()` to keep the return type uniform.
- `request.authContext!.id` is accessed with a non-null assertion — the route-level guard is expected to have already rejected unauthenticated requests; there is no defensive check here.
- `?continue=` and `?locale=` are **query parameters**, not route params, and are validated (same-origin / BCP-47 tag) before being written to cookies; invalid values are silently ignored rather than rejected.
- The link token (`oauth-link` cookie) is what distinguishes this callback from a plain sign-in callback; it ties the return to the specific account that initiated the link.
