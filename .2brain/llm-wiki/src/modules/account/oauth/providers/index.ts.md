---
source: src/modules/account/oauth/providers/index.ts
sha256: 00aa056eb4526bc9aeae3cd8d3f20c9c50456b0be93ea6b0b78dfab4cb72d05d
generated_at: 2026-11-08T04:13:10.109937+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/oauth/providers/index.ts

## Purpose

OAuth provider registry that supports **multiple simultaneously enabled** providers (unlike the single-winner pattern in `payments/providers/index.ts`). It exposes "which providers are configured right now" via closures re-evaluated on every call, so a provider becomes active the moment its env vars appear—no stale import-time memoisation.

## Key elements

- **`OAuthProviderFactory`** (type) — `() => OAuthProvider | undefined`; the unit of registration. A factory, not a value, because "configured" can change between calls.
- **`registry`** (module-private) — built with `createProviderRegistry<OAuthProviderFactory>`; pre-seeded with `google` and `github` factories that delegate to `isOAuthProviderConfigured` + the concrete provider exports.
- **`registerOAuthProvider(name, factory)`** — adds or overrides an entry at runtime. Used by test doubles and by live deployments adding a new provider without editing this file.
- **`enabledProviders(): string[]`** — returns the subset of registered names whose factory currently resolves to a non-undefined provider. Consumed by `GET /config` (via `public-config.ts`).
- **`resolveOAuthProvider(name): OAuthProvider | undefined`** — looks up one provider by name; returns `undefined` if not registered **or** not currently configured. Controllers surface this as a 404 rather than a silent fallback.

## Relationships

- **`src/infrastructure/runtime/provider-registry.ts`** — supplies `createProviderRegistry`, the generic registry utility this file instantiates.
- **`src/modules/account/oauth/providers/google.ts` / `github.ts`** — provide the `googleOAuthProvider` / `githubOAuthProvider` singletons referenced inside the seeded factories.
- **`src/modules/account/oauth/providers/port.ts`** — defines the `OAuthProvider` interface used as the return type throughout.
- **`src/modules/account/oauth/config.ts`** — provides `isOAuthProviderConfigured`, called inside each factory closure to decide whether the provider is active.
- **`src/modules/account/controllers/get-oauth-start.ts` / `get-oauth-callback.ts` / `post-oauth-link-start.ts`** — call `resolveOAuthProvider` to obtain the concrete provider; treat `undefined` as a 404.
- **`src/modules/account/services/public-config.ts`** — calls `enabledProviders()` to populate the `oauthProviders` array in the `GET /config` response.
- **`scenarios/support/development-doubles.ts`** — registers a `fake` provider via `registerOAuthProvider` at preload time; this provider is intentionally **not** seeded in the production registry above.
- **Test files** (`oauth.contract.test.ts`, `login-paths.contract.test.ts`, `auth-races.test.ts`, `login-restore.test.ts`, `session-modes.test.ts`) — exercise the registry through the public API (`enabledProviders`, `resolveOAuthProvider`, `registerOAuthProvider`).

## Notes

- `fake` is deliberately excluded from the seeded registry; it lives outside `src/` and is injected only via the dev preload. Do not add it to the literal here.
- Adding a new provider in production means writing a new `providers/<name>.ts` file and calling `registerOAuthProvider` from your bootstrap—no edit to this file is required.
- Because factories are re-invoked on every call, changing env vars (e.g. in tests) takes effect immediately without a module-bust or restart.
