---
source: src/modules/account/oauth/config.ts
sha256: 3ed8d51132f898164a73481b8a5757e47343d43374c8a49357fcaf1314ef9ac6
generated_at: 2026-09-23T18:06:00.787974+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/oauth/config.ts

## Purpose

Centralized OAuth configuration for the account module: env-var credential access, a shared fetch timeout, and redirect-URI construction. Exists so that `./providers/*` and the OAuth controllers never spell raw `process.env.NODE_OAUTH_*` names or build redirect URLs on their own. Named `config.ts` by convention (cf. `../session/config`): it reads policy, it doesn't hold or mint anything.

## Key elements

- **`OAUTH_FETCH_TIMEOUT_MS`** (5 000) — shared `AbortSignal.timeout` budget for all outbound provider HTTP calls (token exchange, GitHub profile/email). Prevents an unresponsive provider from holding a callback open.
- **`OAuthCredentials`** — interface for a provider's `{ clientId?, clientSecret? }` pair; fields are optional because a deployment may not set them.
- **`getOAuthCredentials(name)`** — looks up `NODE_OAUTH_<NAME>_CLIENT_ID` / `_CLIENT_SECRET` from the environment and returns them as an `OAuthCredentials` object.
- **`isOAuthProviderConfigured(name)`** — `true` only when both `clientId` and `clientSecret` are non-empty. Used by the provider registry as its "configured" gate.
- **`oauthRedirectUri(provider)`** — returns the absolute `redirect_uri` (`{NODE_URL}/account/oauth/{provider}/callback`) presented to every provider. Always derived from `NODE_URL`; never from the incoming request.
- **`oauthFrontendCallbackUrl(errorCode?)`** — the paired frontend's `/oauth/callback` URL, with an optional `?error=` query.
- **`oauthFrontendMfaCallbackUrl(challenge)`** — frontend callback URL carrying the 2FA metadata (`mfaRequired`, `expiresAt`, `methods`, optional `defaultMethod`) as query params. The challenge **token itself is excluded**; it travels in `MFA_CHALLENGE_COOKIE` (see `oauth/mfa-redirect.ts`).
- **`backendUrl(path)`** _(internal)_ — joins `path` onto `NODE_URL` via `new URL()`, falling back to `http://localhost:3000/` only when `NODE_URL` is unset (test env).

## Relationships

- **`get-oauth-start.ts`** — calls `oauthRedirectUri` to build the provider auth URL and `isOAuthProviderConfigured` to gate the start.
- **`get-oauth-callback.ts`** — reads `oauthRedirectUri` for validation, and `oauthFrontendCallbackUrl` / `oauthFrontendMfaCallbackUrl` to redirect the browser after token exchange or 2FA.
- **`providers/github.ts` / `providers/google.ts`** — consume `OAUTH_FETCH_TIMEOUT_MS` for their `fetch` calls and `getOAuthCredentials` for credentials.
- **`providers/index.ts`** — uses `isOAuthProviderConfigured` to populate the registry's configured/not-configured state.
- **`src/types/index.ts`** — source of the `MfaChallenge` type imported for `oauthFrontendMfaCallbackUrl`'s parameter.
- **`tests/unit/oauth-github.test.ts` / `oauth-google.test.ts`** — exercise the credential and timeout paths through their respective provider modules.

## Notes

- `backendUrl` and `oauthFrontendCallbackBase` are **not exported**; they are internal helpers. Consumers should use the exported URI functions.
- The `NODE_URL` localhost fallback (`http://localhost:3000/`) is only reachable in `NODE_ENV=test`; in production `kernel/required-config.ts` enforces that `NODE_URL` is set.
- `oauthFrontendMfaCallbackUrl` accepts `Omit<MfaChallenge, 'mfaRequired' | 'challenge'>` specifically to make it a type-level error to pass the full `MfaChallenge` (and thus risk serializing the token into the URL).
- The redirect URI is derived from `NODE_URL` in exactly one place; both the start and callback controllers must read it through `oauthRedirectUri` to keep the open-redirect invariant intact.
