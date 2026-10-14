---
source: src/modules/account/controllers/get-oauth-start.ts
sha256: fb7f3013e4cd9f579ec8cce22fa89d1a3cb63465897f6062070058969eb101ce
generated_at: 2026-10-14T08:31:48.269068+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/controllers/get-oauth-start.ts

## Purpose

Single-handler controller for `GET /account/oauth/:provider`. It is the one route in the account module that answers a browser navigation with a `302 Location` redirect rather than a JSON envelope, because the destination is an external consent screen and there is no body to negotiate.

## Key elements

- **`getOAuthStart(request, response)`** — the sole export. Resolves the provider from the URL param, mints OAuth `state` + PKCE `code_verifier`, sets both as cookies, conditionally stores `?continue=` and `?locale=` as cookies, then 302-redirects to the provider's authorize URL.
- Unknown provider → `rejectResponse(response, 404, [t('account.oauth.unknown-provider')])` and an early return.
- `continue` cookie is set only when the value passes `isSameOriginPath`; `locale` cookie only when it passes `isLocaleTag`. Invalid values are dropped silently (no JSON error is possible here).

## Relationships

- **`src/modules/account/routes.ts`** — registers this handler on the `GET /account/oauth/:provider` path.
- **`src/modules/account/oauth/providers/index.ts`** — `resolveOAuthProvider` maps the URL param to a configured provider object (or `null`).
- **`src/modules/account/oauth/state.ts`** — supplies all state/PKCE/cookie helpers (`generateOAuthState`, `generateCodeVerifier`, `codeChallengeOf`, and the five `create*Cookie` functions plus the two validators).
- **`src/modules/account/oauth/config.ts`** — `oauthRedirectUri` builds the provider-specific callback URI passed to `provider.authorizeUrl`.
- **`src/infrastructure/http/response.ts`** — `rejectResponse` formats the 404 JSON envelope for the unknown-provider case.
- **`src/infrastructure/i18n/index.ts`** — `t` localises the 404 message. (Transitively depends on `context.ts`.)

## Notes

- The redirect is a hard `302`; there is no JSON path on the happy branch. The only JSON response this route can produce is the 404 for an unconfigured provider.
- `continue` and `locale` are *optional* and *silent*: a bad value is simply not persisted, because the route has nowhere to display an error to the caller.
- Provider name is lowercased before lookup (`String(request.params.provider).toLowerCase()`), so URL casing is forgiving.
