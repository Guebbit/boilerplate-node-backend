---
source: src/modules/account/controllers/get-oauth-start.ts
sha256: b9a2a7ca00e8909e0cda5a112ed534fba3bf4904ad8cb0c978db3dcea6ce950c
generated_at: 2026-09-23T18:00:40.419645+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/get-oauth-start.ts

## Purpose

Express controller for `GET /account/oauth/:provider`. It is the single route in the account module that responds with a `Location` redirect (302) rather than a JSON envelope, sending the browser to the provider's consent screen after minting CSRF `state` and PKCE credentials.

## Key elements

- **`getOAuthStart(request, response)`** – The sole export. Resolves the provider by name (lowercased), 404s via `rejectResponse` if unconfigured, then:
    1. Generates an OAuth `state` token and sets it as a cookie.
    2. Generates a PKCE code verifier, sets it as a cookie, and derives the code challenge.
    3. Builds the authorize URL via `provider.authorizeUrl(state, redirectUri, challenge)` and issues a 302 redirect.

## Relationships

- **`src/modules/account/routes.ts`** – Registers the `GET /account/oauth/:provider` route that dispatches to `getOAuthStart`.
- **`src/modules/account/oauth/providers/index.ts`** – Supplies `resolveOAuthProvider`, the lookup that maps a provider name string to a configured provider object (or `null`).
- **`src/modules/account/oauth/state.ts`** – Supplies all PKCE/CSRF primitives: `generateOAuthState`, `createStateCookie`, `generateCodeVerifier`, `codeChallengeOf`, `createVerifierCookie`.
- **`src/modules/account/oauth/config.ts`** – Supplies `oauthRedirectUri(name)`, the canonical callback URL handed to the provider.
- **`src/infrastructure/http/response.ts`** – Supplies `rejectResponse`, used to emit the 404 JSON envelope when the provider is unknown.
- **`src/infrastructure/i18n/index.ts`** – Supplies the `t` translation function used in the 404 error message (`account.oauth.unknown-provider`).

## Notes

- The 404 is deliberate and loud: an unconfigured provider must not silently fall through. The comment explicitly parallels the "unset `NODE_PAYMENT_PROVIDER`" convention.
- The controller is the _only_ route in this module that returns a redirect; every other account controller returns a JSON envelope via the `rejectResponse` / success helpers.
- Provider name matching is case-insensitive (`toLowerCase()` on the param) but must still be an exact key in the provider registry.
- Both `state` and the PKCE verifier are stored as cookies (not query params) so they survive a potential multi-step consent flow and are not visible in the URL.
