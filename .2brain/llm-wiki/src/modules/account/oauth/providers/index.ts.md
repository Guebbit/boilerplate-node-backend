---
source: src/modules/account/oauth/providers/index.ts
source_sha256: d5b7abcc668ab6e3cdc0a8607a60b61947f2b24b889196bdbefb6cd31d60b107
context_sha256: bf4bd918db61e15ebd4403420f65bdf7e089db6b5a42ad4be388eb768f54bffe
generated_at: 2026-11-22T03:32:39.854989+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/account/oauth/providers/index.ts

## Purpose
The OAuth provider registry. Unlike the payments registry, which has one active provider, several OAuth providers can be enabled at once. So this file reports which providers are configured right now, instead of memoising a single winner. Each registry entry is a factory re-checked on every call, so a provider becomes available as soon as its env vars are set, with no restart.

## Key elements
- `OAuthProviderFactory` (internal type): `() => OAuthProvider | undefined`. It returns the provider when configured and `undefined` otherwise.
- `registry` (internal): created with `createProviderRegistry`. It is seeded with `google` and `github` factories, each gated by `isOAuthProviderConfigured(name)`.
- `registerOAuthProvider(name, factory)`: adds or overrides an implementation without editing this file. It is used for live deployments and for tests.
- `enabledProviders()`: returns the names whose factory currently yields a provider. This is what `oauthProviders` on `GET /config` reports. A deployment with no keys set returns an empty list.
- `resolveOAuthProvider(name)`: returns the provider only if it is enabled, otherwise `undefined`. A provider with unset env vars behaves as if its route did not exist.

## Relationships
- **Registry infrastructure:** builds on `createProviderRegistry` from `src/infrastructure/runtime/provider-registry.ts`.
- **Providers:** imports `googleOAuthProvider` from `./google` and `githubOAuthProvider` from `./github`. The `OAuthProvider` type comes from `./port`.
- **Config:** `../config` supplies `isOAuthProviderConfigured`, which decides whether each provider is enabled.
- **Test doubles:** `scenarios/support/development-doubles.ts` registers the `fake` provider through `registerOAuthProvider`. `fake` is deliberately not seeded here because it lives outside `src/`.
- **Consumers:** the controllers `get-oauth-start.ts`, `get-oauth-callback.ts` and `post-oauth-link-start.ts` resolve providers by name. `src/modules/account/services/public-config.ts` lists them through `enabledProviders`. The controller 404 comes from `resolveOAuthProvider` returning `undefined`, per the file's own comments.
- **Tests:** the contract tests (`login-paths`, `oauth`) and the integration tests (`auth-races`, `login-restore`, `session-modes`) exercise this registry.

## Notes
- Factories are evaluated on every call. Nothing is cached, so configuration changes take effect immediately.
- The failure mode is intentionally loud. An unconfigured provider is "not found" and never silently wrong.
- Adding a production provider means adding a provider file and calling `registerOAuthProvider`. The built-in seed list does not need to change.
