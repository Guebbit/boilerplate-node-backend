---
source: src/modules/account/oauth/config.ts
sha256: da8f9f2e42c1f772cbccc2101c07a15256ab868f1c3ff04d4d3594aa89257e99
generated_at: 2026-11-08T04:11:59.484590+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/oauth/config.ts

## Purpose

Centralizes all OAuth-related environment-variable access, timeout policy, and URL-building logic so that providers and controllers never reference a `NODE_OAUTH_*` variable name or construct a redirect/callback URL themselves. It reads configuration and derives URLs; it does not hold sessions or mint tokens.

## Key elements

- **`OAuthCallbackError`** — Type extracted from the shared `REDIRECT_QUERY_ENUMS` contract; enumerates the `?error=` values the frontend callback page may receive.
- **`OAUTH_FETCH_TIMEOUT_MS`** — `5000`; the single timeout (via `AbortSignal.timeout`) for all outbound provider HTTP calls (token exchange, GitHub profile/email fetches).
- **`oauthConfig`** — A `defineConfig` instance declaring the four `NODE_OAUTH_{GOOGLE,GITHUB}_{CLIENT_ID,CLIENT_SECRET}` fields (`text()`, secrets flagged `sensitive`).
- **`OAuthCredentials`** — Interface: optional `clientId` / `clientSecret` pair.
- **`getOAuthCredentials(name)`** — Returns the credential pair for `'google'` or `'github'`; `{}` for anything else.
- **`isOAuthProviderConfigured(name)`** — `true` only when both halves are present; the registry's "is this provider active" gate.
- **`backendUrl(path)`** *(private)* — `new URL(path, siteConfig().NODE_URL).href`; produces an absolute URL rooted at `NODE_URL`.
- **`oauthRedirectUri(provider)`** — The absolute `redirect_uri` this app presents to the provider (`/account/oauth/:provider/callback`). Always derived from `NODE_URL`, never from the request.
- **`oauthCallbackUrl(provider, originalUrl)`** — Rebuilds the callback `URL` from `NODE_URL` and attaches the **raw** query string (sliced from `originalUrl`, not re-serialized from `request.query`) to preserve repeated parameters.
- **`oauthFrontendCallbackUrl(errorCode?, continueTo?, locale?, linked?)`** — Builds the browser-redirect target on the frontend's `/oauth/callback` for the normal success/error path.
- **`oauthFrontendMfaCallbackUrl(challenge, continueTo?, locale?)`** — Browser-redirect target when 2FA is required; carries the non-secret challenge metadata in the query string (the secret token lives in a cookie).
- **`oauthFrontendDeletionCallbackUrl(pending, continueTo?, locale?)`** — Browser-redirect target during the account-deletion grace window; carries `purgeAt`/`expiresAt` in the query.

## Relationships

- **`src/infrastructure/config/define.ts`** / **`fields.ts`** — Provides `defineConfig` and the `text()` field factory used to declare the env-var shape.
- **`src/infrastructure/http/config.ts`** — Supplies `siteConfig()` (`NODE_URL`, `NODE_FRONTEND_URL`), the base for every absolute URL this file constructs.
- **`src/modules/account/controllers/get-oauth-start.ts`** — Reads `oauthRedirectUri` and `getOAuthCredentials` to build the provider auth request.
- **`src/modules/account/controllers/get-oauth-callback.ts`** — Reads `oauthCallbackUrl`, `isOAuthProviderConfigured`, `OAUTH_FETCH_TIMEOUT_MS`, and the three `oauthFrontend*` URL builders to complete the callback flow.
- **`src/modules/account/controllers/post-oauth-link-start.ts`** — Consumes the same credential/redirect-URI helpers for the "link a provider to an existing account" flow.
- **`src/modules/account/oauth/providers/client.ts`** / **`github.ts`** — Call `getOAuthCredentials` for auth and apply `OAUTH_FETCH_TIMEOUT_MS` to their outbound `fetch` calls.
- **`src/modules/account/oauth/providers/index.ts`** — Uses `isOAuthProviderConfigured` to decide which providers appear in the registry.
- **`src/modules/account/tests/unit/oauth-github.test.ts`** / **`oauth-google.test.ts`** — Unit-test the credential lookup and URL-building for each provider.
- **`src/types/index.ts`** — Source of the `MfaChallenge` and `DeletionPending` types that parameterize the MFA and deletion callback-URL builders.

## Notes

- `oauthRedirectUri` and `oauthCallbackUrl` are deliberately **request-independent** for the scheme/host portion: deriving them from `NODE_URL` (not `req.host`/`req.protocol`) is the open-redirect guard.
- `oauthCallbackUrl` slices the raw query off `originalUrl` rather than re-encoding from `request.query` because Express's parser collapses repeated params into arrays, which would mask a malicious duplicate `code`.
- The `continueTo` and `locale` parameters on every frontend-URL builder are **caller-validated** (against `isSameOriginPath` / `isLocaleTag` in `oauth/state.ts`); this file does not re-validate.
- `backendUrl` is module-private; only `oauthRedirectUri` uses it. Any new URL that must be absolute against `NODE_URL` should route through it.
- The file intentionally contains **no** token minting, session logic, or provider-specific HTTP calls—those live in `./providers/*` and the controllers.
