---
source: src/modules/account/oauth/config.ts
sha256: 610c8ad2939103b83320ea515a111c2f5ac4404432f6d53a9d130d3daba80e53
generated_at: 2026-09-27T14:27:37.843353+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/oauth/config.ts

## Purpose

Centralised read-only access to OAuth-related environment variables and URL construction. Exists so that providers and controllers never spell a `NODE_OAUTH_*` env-var name or build a redirect URI on their own — one module owns "what is the config" while the rest of the oauth flow owns "what to do with it."

## Key elements

- **`OAUTH_FETCH_TIMEOUT_MS`** (`5000`) — shared `AbortSignal.timeout` value for every outbound provider HTTP call (token exchange, profile/email lookups). Prevents an unresponsive provider from holding a callback and ensures no provider picks its own number.
- **`OAuthCredentials`** — interface: optional `clientId` / `clientSecret`.
- **`getOAuthCredentials(name)`** — builds the `NODE_OAUTH_<NAME>_CLIENT_ID` / `_CLIENT_SECRET` keys from a registry key and returns whatever is in the environment (or `undefined`).
- **`isOAuthProviderConfigured(name)`** — `true` only when both halves are present; used as the registry's "configured" gate.
- **`oauthRedirectUri(provider)`** — the absolute `redirect_uri` presented to the provider. Derived from `NODE_URL` via `new URL(path, base)`, never from the incoming request. This is the single source both the start and callback controllers read.
- **`oauthFrontendCallbackUrl(errorCode?, continueTo?)`** — the URL the callback controller sends the browser to once OAuth is done. Accepts an optional error code and a (caller-validated) `continue` target.
- **`oauthFrontendMfaCallbackUrl(challenge, continueTo?)`** — the URL used when 2FA is armed. Carries non-secret `MfaChallenge` metadata (`expiresAt`, `methods`, optional `defaultMethod`) as query params; the challenge token itself travels in a cookie, not here.
- **`backendUrl(path)`** *(private)* — joins a relative path onto `NODE_URL` using the `URL` constructor; falls back to `http://localhost:3000/` (test-only, per `kernel/required-config.ts`).

## Relationships

| Neighbour | Interaction |
|---|---|
| `get-oauth-start.ts` | Calls `oauthRedirectUri` and `isOAuthProviderConfigured` to build the provider authorisation URL. |
| `get-oauth-callback.ts` | Calls `oauthRedirectUri` (validation), `oauthFrontendCallbackUrl`, and `oauthFrontendMfaCallbackUrl` to determine where to redirect the browser. |
| `providers/github.ts` / `providers/google.ts` | Call `getOAuthCredentials` for credentials and pass `OAUTH_FETCH_TIMEOUT_MS` to `AbortSignal.timeout` on every `fetch`. |
| `providers/index.ts` | Uses `isOAuthProviderConfigured` to populate the registry's "configured" flag per provider. |
| `src/types/index.ts` | Source of the `MfaChallenge` type imported here for `oauthFrontendMfaCallbackUrl`'s parameter. |
| `tests/unit/oauth-github.test.ts` / `oauth-google.test.ts` | Unit-test the credential helpers and timeout constant against the provider implementations. |

## Notes

- **Open-redirect guard:** `oauthRedirectUri` is derived exclusively from `NODE_URL`; a request-supplied redirect target is never trusted. The doc comment calls this out explicitly.
- **`continueTo` trust boundary:** `oauthFrontendCallbackUrl` and `oauthFrontendMfaCallbackUrl` accept `continueTo` as-is. Callers **must** validate it against `oauth/state.ts#isSameOriginPath` first — this module performs no validation itself.
- **Token-exclusion by type:** `oauthFrontendMfaCallbackUrl`'s parameter is typed `Omit<MfaChallenge, 'mfaRequired' | 'challenge'>` so a future refactor cannot accidentally serialise the challenge token into a URL query string.
- **Env-var naming is positional:** the key is built as `NODE_OAUTH_${name.toUpperCase()}_…`. A typo in a provider's registry key silently yields `undefined` credentials rather than throwing.
- **`backendUrl` is not exported** — it is an implementation detail of `oauthRedirectUri`; other modules should not import it.
