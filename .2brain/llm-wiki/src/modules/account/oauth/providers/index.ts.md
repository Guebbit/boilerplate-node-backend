---
source: src/modules/account/oauth/providers/index.ts
sha256: 1b94159989401a6b4f2878549c1510964d287ee1a40035afb9cce3a56956cb04
generated_at: 2026-10-14T08:44:01.551812+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/oauth/providers/index.ts

## Purpose

Central registry that tracks which OAuth providers (Google, GitHub) are currently enabled based on their environment variables. Unlike the payments module (single active provider), multiple OAuth providers can be active simultaneously, so this exposes a live "who is configured" query rather than a memoized winner. Providers are re-evaluated on every call so that setting/unsetting env vars takes effect without a restart.

## Key elements

- **`registerOAuthProvider(name, factory)`** — Adds or overrides a provider entry at runtime. Used by deployments to register custom providers and by tests to inject fakes. No file edit needed here.
- **`enabledProviders()`** — Returns the array of provider names currently resolved to a configured instance. A deployment with no keys set returns `[]`. Consumed by the `GET /account/oauth/providers` endpoint.
- **`resolveOAuthProvider(name)`** — Looks up a single provider by name and calls its factory. Returns `undefined` if the name is unknown or the provider's env vars are not set. Controllers treat `undefined` as a 404.
- **`registry`** (module-internal) — Built via `createProviderRegistry<OAuthProviderFactory>`; seeds `google` and `github` entries whose factories call `isOAuthProviderConfigured` at resolution time.
- **`OAuthProviderFactory`** (internal type) — `() => OAuthProvider | undefined`. Documents the contract that every registered entry is a *factory*, not a value.

## Relationships

- **`src/infrastructure/runtime/provider-registry.ts`** — Supplies `createProviderRegistry`, the generic registry primitive. This file is the OAuth-specific instantiation of it.
- **`src/modules/account/oauth/providers/port.ts`** — Defines the `OAuthProvider` interface used as the type parameter for the registry and the return type of `resolveOAuthProvider`.
- **`src/modules/account/oauth/providers/google.ts`** / **`github.ts`** — Provide the concrete `googleOAuthProvider` / `githubOAuthProvider` instances referenced inside the factory closures.
- **`src/modules/account/oauth/config.ts`** — Provides `isOAuthProviderConfigured`, the predicate each factory calls to decide whether to return the provider or `undefined`.
- **`src/modules/account/controllers/get-oauth-providers.ts`** — Calls `enabledProviders()` to build the list returned to the client.
- **`src/modules/account/controllers/get-oauth-start.ts`** / **`get-oauth-callback.ts`** — Call `resolveOAuthProvider(name)` to obtain the provider for the requested flow step; `undefined` → 404.
- **`scenarios/support/development-doubles.ts`** — Registers a `fake` provider via `registerOAuthProvider` so integration tests can exercise OAuth without real credentials. The `fake` entry is intentionally absent from this file's seed list.

## Notes

- Providers are **factories**, not singletons. Calling `enabledProviders()` twice in the same process can yield different results if env vars change between calls (e.g., in a test that toggles config). Do not cache the returned array across awaits.
- The `fake` provider is **not** seeded in this file. It lives outside `src/` and is registered by the dev preload. If you see `fake` missing from `enabledProviders()` in a test, check that `development-doubles.ts` ran before the test.
- Naming convention: the registry key (e.g. `"google"`) is the same string a client sends in the URL path and what `OAuthAccount` stores. Mismatch = silent 404 at the controller.
