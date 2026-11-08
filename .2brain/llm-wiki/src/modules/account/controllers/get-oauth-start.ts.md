---
source: src/modules/account/controllers/get-oauth-start.ts
sha256: fb7f3013e4cd9f579ec8cce22fa89d1a3cb63465897f6062070058969eb101ce
generated_at: 2026-11-08T04:02:10.665534+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/get-oauth-start.ts

## Purpose

Controller for `GET /account/oauth/:provider`. Validates the provider name, mints a CSRF `state` value and a PKCE code verifier (both stored as cookies), optionally persists `?continue=` and `?locale=` query parameters as cookies, and responds with a **302 redirect** to the provider's consent screen. It is the sole account route that answers with a redirect rather than a JSON body.

## Key elements

- **`getOAuthStart(request, response)`** — the only export. Orchestrates the entire start-of-OAuth-login flow:
  - Lower-cases `request.params.provider` and resolves it via `resolveOAuthProvider`; returns `404` with an i18n message if unknown.
  - Generates and cookie-stores `state` (`generateOAuthState` / `createStateCookie`).
  - Generates and cookie-stores the PKCE verifier (`generateCodeVerifier` / `createVerifierCookie`).
  - Conditionally cookie-stores `?continue=` (if same-origin) and `?locale=` (if a valid BCP-47 tag).
  - Builds the authorization URL via `provider.authorizeUrl(state, oauthRedirectUri, codeChallengeOf(verifier))` and issues `response.redirect(302, …)`.

## Relationships

- **`src/modules/account/routes.ts`** — registers this handler on the `GET /account/oauth/:provider` path.
- **`src/modules/account/oauth/providers/index.ts`** — supplies `resolveOAuthProvider` (name → provider config) and the provider's `authorizeUrl` method.
- **`src/modules/account/oauth/state.ts`** — supplies every state/verifier/cookie helper: `generateOAuthState`, `createStateCookie`, `generateCodeVerifier`, `codeChallengeOf`, `createVerifierCookie`, `createContinueCookie`, `createLocaleCookie`, `isSameOriginPath`, `isLocaleTag`.
- **`src/modules/account/oauth/config.ts`** — provides `oauthRedirectUri(provider.name)` used as the `redirect_uri` in the authorization request.
- **`src/infrastructure/http/response.ts`** — `rejectResponse` is used for the 404 unknown-provider path.
- **`src/infrastructure/i18n/index.ts` / `context.ts`** — the `t()` function renders the `account.oauth.unknown-provider` error string.

## Notes

- This is the **only** account route that never emits a JSON envelope; the 404 for an unconfigured provider is the exception (it must be "loud" per the comment). All other error paths are absent by design—invalid `?continue=` or `?locale=` are silently dropped because there is no response body in which to surface an error to the browser.
- The provider lookup is case-insensitive (lower-cased before resolution), but the cookie/redirect values are used as-is.
- PKCE is S256: the verifier stays in a cookie; only the `codeChallenge` (S256 hash) appears in the redirect URL.
