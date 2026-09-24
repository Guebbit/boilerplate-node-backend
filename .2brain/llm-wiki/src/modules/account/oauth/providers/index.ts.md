---
source: src/modules/account/oauth/providers/index.ts
sha256: ed95f553e0107212e0b12161c89cbbcc971f2066dc944ba04633ea3d3a7a3ed0
generated_at: 2026-09-23T18:06:48.590290+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/oauth/providers/index.ts

## Purpose

Central registry that maps provider names (`google`, `github`, `fake`) to their concrete `OAuthProvider` implementations, but only when each provider is actually configured in the current environment. Unlike the single-winner pattern used in `payments/providers/index.ts`, multiple OAuth providers can be active simultaneously, so this module answers "which are available right now" rather than picking one.

## Key elements

- **`PROVIDERS`** (internal) — `Partial<Record<string, () => OAuthProvider | undefined>>`. Each entry is a closure that re-checks configuration on every call (`isOAuthProviderConfigured` for google/github, `isDemoMode` for fake), so a provider becomes visible the moment its env vars or demo flag are set, with no import-time memo to go stale.
- **`enabledProviders()`** (export) — Returns the array of provider names currently resolvable. Used by `GET /account/oauth/providers` to list what the deployment actually supports.
- **`resolveOAuthProvider(name)`** (export) — Looks up a provider by name; returns `undefined` if the name is unknown *or* if the provider is not configured. Controllers treat `undefined` as a 404.

## Relationships

- **`./port`** — Imports the `OAuthProvider` interface type that all implementations and the registry are typed against.
- **`./google`**, **`./github`**, **`./fake`** — Concrete provider instances imported and wrapped in the registry closures.
- **`../config`** — `isOAuthProviderConfigured(name)` gates google and github entries at call time.
- **`@infrastructure/runtime/demo-profile`** — `isDemoMode()` gates the `fake` entry.
- **`src/modules/account/controllers/get-oauth-start.ts`** — Calls `resolveOAuthProvider` to obtain the provider for the requested name before building the authorization URL.
- **`src/modules/account/controllers/get-oauth-callback.ts`** — Calls `resolveOAuthProvider` to exchange the callback code.
- **`src/modules/account/controllers/get-oauth-providers.ts`** — Calls `enabledProviders` to list available options to the client.
- **`src/modules/account/tests/unit/oauth-providers.test.ts`** — Unit-tests the registry's resolution and listing behavior.
- **`src/infrastructure/runtime/demo-profile.ts`** — Supplies the `isDemoMode` check that activates the fake provider.

## Notes

- The `Partial<Record<…>>` shape is deliberate: an unrecognised name (typo, unshipped provider) resolves to `undefined` at the map level, so `PROVIDERS[name]?.()` is safe without a separate existence check.
- Configuration is evaluated **per call**, not at module load. Tests or dev tooling that set env vars mid-process will see the provider appear without a restart.
- `fake` is gated by `isDemoMode()`, not by an env-var pair like the real providers; see `./fake`'s own docs for why it needs no credentials.
- The contrast with `payments/providers/index.ts` (single active provider, memoised winner) is called out in the module doc comment to prevent copy-paste confusion between the two subsystems.
