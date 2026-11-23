---
source: src/infrastructure/runtime/provider-registry.ts
source_sha256: 383e7b35ad45e417e868aeac057cacf58437fb33f38dd4102b81cd7816c1d53c
context_sha256: dac6e1f6ea3ae7d98667d5ba241327dae6b8acf62cfb8eeb565d2064e717c3c5
generated_at: 2026-11-22T03:06:57.748344+00:00
model: claude-code:claude-sonnet-5-5
---

# src/infrastructure/runtime/provider-registry.ts

## Purpose
A generic named table of interchangeable implementations ("name in, implementation out"), written once and shared by the antibot, analytics, payments and OAuth seams. It only stores and looks up; whether an unknown name throws or yields `undefined` is left to each caller.

## Key elements
- `ProviderRegistry<T>` — interface with `register(name, provider)` (also used to override in tests), `names()` (insertion order) and `resolve(name)` (returns `T | undefined`).
- `createProviderRegistry(initial?)` — builds a private registry backed by a fresh `Map`, seeded from a record. `T` is unconstrained: it can be a plain implementation or a lazy factory (e.g. `() => OAuthProvider | undefined`); the registry never invokes `T`.
- `createSharedProviderRegistry(name, initial?)` — registry whose backing map lives on `globalThis` under `Symbol.for("boilerplate-node-backend.provider-registry.<name>")`. Same `name` yields the same map across module instances. `initial` only applies to the call that creates the map.
- `requireProvider(registry, variable, name, developmentNames?)` — strict resolution: returns the provider or throws `Error`. The message is `Unknown <variable>: "<name>". Allowed: ...` listing registered names; if `name` is in `developmentNames`, the message instead says it is a development double loaded only when `NODE_ENV=development`.
- `registryOver` (private) — wraps a `Map` in the `ProviderRegistry` interface for both factories.

## Relationships
The neighbor files are the adapter and module provider registries (`src/infrastructure/adapters/antibot-providers/index.ts`, `mail-transports.ts`, `pdf.ts`, `pinned-https.ts`, `src/infrastructure/observability/analytics/index.ts`, `src/modules/invoicing/providers/index.ts`, `src/modules/payments/providers/index.ts`, `src/modules/payments/providers/registry.ts`, `src/modules/account/oauth/providers/index.ts`) and `src/infrastructure/runtime/settle.ts`. They sit on the dependency graph with this file, and the header comment names antibot, analytics, payments and OAuth as the ports that use it. The file's content does not show which of them import it. `tests/unit/infrastructure/runtime/provider-registry.test.ts` is its unit test.

## Notes
- Fail-fast policy lives in callers: `requireProvider` is for ports where a typo must not silently downgrade a control (antibot, analytics, payments). The comment says the app tier probes it at boot so errors surface there rather than on the first request. OAuth callers use plain `resolve()` because "not configured" is routine.
- Use the shared variant for doubles registered before app load (development doubles, jest `setupFiles`). A private map would come back empty after `jest.resetModules` or `isolateModules` re-evaluates the module. It follows the same `globalThis` pattern as `src/infrastructure/config/store.ts`.
- `register` overwrites silently, since it calls `Map.set`.
