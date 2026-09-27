---
source: src/modules/account/controllers/get-oauth-start.ts
sha256: e56bea531e0561a0aece4b8801fa3474cc57ddc2d8c35b5d82a1af42d04015af
generated_at: 2026-09-27T14:23:15.151963+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/get-oauth-start.ts

## Purpose

Express controller for `GET /account/oauth/:provider`. It is the single account route that responds with a `Location` redirect (302) rather than a JSON envelope: it mints the OAuth `state` and PKCE verifier, stores both (plus an optional `continue` path) as cookies, and sends the browser to the provider's consent screen.

## Key elements

- **`getOAuthStart`** (exported) — the route handler. Accepts `(request: Request, response: Response)`.
  - Resolves the provider by lowercasing `:provider` and calling `resolveOAuthProvider`.
  - On unknown provider: calls `rejectResponse(response, 404, …)` and returns early.
  - Generates `state` and `codeVerifier`, sets them via `createStateCookie` / `createVerifierCookie`.
  - If `request.query.continue` passes `isSameOriginPath`, persists it with `createContinueCookie`; otherwise silently ignored.
  - Builds the authorize URL via `provider.authorizeUrl(state, oauthRedirectUri, codeChallengeOf(verifier))` and issues `response.redirect(302, authorizeUrl)`.

## Relationships

- **`src/modules/account/routes.ts`** — registers `getOAuthStart` as the handler for `GET /account/oauth/:provider`.
- **`src/modules/account/oauth/providers/index.ts`** — `resolveOAuthProvider` maps the string param to a concrete provider object (with `.name`, `.authorizeUrl`).
- **`src/modules/account/oauth/state.ts`** — supplies all cryptographic and cookie helpers: `generateOAuthState`, `generateCodeVerifier`, `codeChallengeOf`, `createStateCookie`, `createVerifierCookie`, `createContinueCookie`, `isSameOriginPath`.
- **`src/modules/account/oauth/config.ts`** — `oauthRedirectUri` returns the registered callback URL for a given provider name.
- **`src/infrastructure/http/response.ts`** — `rejectResponse` is the only error path (404 unknown provider); it emits the standard JSON error envelope.
- **`src/infrastructure/i18n/index.ts` / `context.ts`** — `t('account.oauth.unknown-provider')` localises that 404 message.

## Notes

- This route is the **only** account endpoint that cannot express a JSON error body to the user — the browser is already mid-navigation. The one exception is the 404, which is deliberately "loud" (mirrors the `NODE_PAYMENT_PROVIDER` unset pattern) so a misconfigured deployment is immediately visible.
- An invalid or absent `?continue=` value is **dropped silently** (no error response, no redirect loop); only same-origin relative paths are accepted.
- The provider param is lowercased before lookup, so `?provider=Google` and `?provider=google` both resolve.
- The redirect is **302** (temporary), not 301, consistent with OAuth consent-screen semantics.
