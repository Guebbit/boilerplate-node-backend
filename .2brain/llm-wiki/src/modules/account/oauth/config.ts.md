---
source: src/modules/account/oauth/config.ts
sha256: 16302212227e69bdac69ecdd4310577f5a5cdf0805dc28ebec449969f4a13c55
generated_at: 2026-10-14T08:42:37.087294+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/oauth/config.ts

## Purpose

Centralizes all OAuth environment-variable access and URL construction for the account module. Providers and controllers consume the exports here rather than spelling `NODE_OAUTH_*` names or deriving redirect URIs from untrusted request data. The file reads and validates configuration only; it does not hold tokens or mint sessions.

## Key elements

- **`OAUTH_FETCH_TIMEOUT_MS`** (`5000`) — single timeout shared by all outbound provider HTTP calls (token exchange, profile fetch), applied via `AbortSignal.timeout`.
- **`oauthConfig`** — `defineConfig` block declaring the four `NODE_OAUTH_{GOOGLE,GITHUB}_CLIENT_{ID,SECRET}` vars (secrets marked `sensitive`). Its `check` function rejects boot when a provider is enabled but mail delivery is unavailable, since provider accounts have no password and rely on mail for step-up.
- **`OAuthCredentials`** — interface: optional `clientId` / `clientSecret` strings.
- **`getOAuthCredentials(name)`** — returns the matching provider's credential pair from `oauthConfig()`; returns `{}` for an unrecognized name.
- **`isOAuthProviderConfigured(name)`** — `true` only when both `clientId` and `clientSecret` are set; used as the registry's "enabled" gate.
- **`oauthRedirectUri(provider)`** — absolute backend callback URL (`<NODE_URL>/account/oauth/<provider>/callback`), always derived from `NODE_URL` via `new URL()` to avoid trailing-slash bugs.
- **`oauthCallbackUrl(provider, originalUrl)`** — same base URL with the request's **raw** query string sliced from `originalUrl` (preserves repeated params that a rebuilt query would collapse).
- **`oauthFrontendCallbackUrl(errorCode?, continueTo?, locale?)`** — frontend landing-page URL with optional `error`, `continue`, `locale` query params.
- **`oauthFrontendMfaCallbackUrl(challenge, continueTo?, locale?)`** — frontend URL for the 2FA step; serializes `expiresAt`, `methods`, optional `defaultMethod` as query params. The `MfaChallenge` token is deliberately **excluded** (travels in a cookie instead).
- **`backendUrl(path)`** (private) — resolves a relative path against `siteConfig().NODE_URL`.
- **`PROVIDER_PAIRS`** (private) — `as const` array of the four env-var name pairs, used by the `check` function.

## Relationships

- **`@infrastructure/config/define`** — provides `defineConfig` and `isRelaxedIn` used by the config declaration and its boot check.
- **`@infrastructure/config/fields`** — provides the `text()` field descriptor for each env var.
- **`@infrastructure/adapters/config`** — supplies `mailConfig` read inside the `check` function.
- **`@infrastructure/adapters/mail-transports`** — supplies `mailDelivers()` used in the same check.
- **`@infrastructure/http/config`** — supplies `siteConfig()` for `NODE_URL` and `NODE_FRONTEND_URL`.
- **`@types`** — imports the `MfaChallenge` type used in `oauthFrontendMfaCallbackUrl`.
- **`./providers/client.ts`** — consumes `OAUTH_FETCH_TIMEOUT_MS` when issuing provider HTTP requests.
- **`./providers/github.ts` / `./providers/index.ts`** — call `getOAuthCredentials` / `isOAuthProviderConfigured` to resolve credentials and gate registration.
- **`../controllers/get-oauth-start.ts`** — reads `oauthRedirectUri` to build the provider authorization URL.
- **`../controllers/get-oauth-callback.ts`** — reads `oauthCallbackUrl`, `oauthFrontendCallbackUrl`, and `oauthFrontendMfaCallbackUrl` to complete the flow.
- **`../module.ts`** — wires the two controller routes that depend on these exports.
- **Tests** (`oauth-github.test.ts`, `oauth-google.test.ts`, `reauth-policy.test.ts`) — exercise credential resolution, redirect-URI construction, and the mail-delivery boot check.

## Notes

- **Redirect URIs are never request-derived.** Both `oauthRedirectUri` and `oauthCallbackUrl` build the scheme/host from `NODE_URL` only; the request's `Host` or `Origin` is intentionally ignored to prevent open-redirect / callback-confusion attacks.
- **Raw query preservation.** `oauthCallbackUrl` slices `?…` off `request.originalUrl` verbatim rather than rebuilding from `request.query`, because the parser would fold a repeated `code` param into an array and hide an invalid callback.
- **`getOAuthCredentials` returns `{}` for unknown names**, not `undefined`—callers must still check `isOAuthProviderConfigured` before treating a provider as available.
- **`oauthFrontendMfaCallbackUrl`** intentionally strips `mfaRequired` and `challenge` token from the serialized challenge; passing a full `MfaChallenge` object would leak the token into the URL.
- The `check` function is a **boot-time guard only**; it does not block a deployment that has no provider enabled (`PROVIDER_PAIRS.some(…)` is `false`).
