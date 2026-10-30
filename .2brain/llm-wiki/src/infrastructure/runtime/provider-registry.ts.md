---
source: src/infrastructure/runtime/provider-registry.ts
sha256: 4357e201086bbe9363119bf0582e409251f96796ce3ff87fe948485abb2c5ad8
generated_at: 2026-10-29T02:15:06.655802+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/runtime/provider-registry.ts

## Purpose

Defines a single, generic `ProviderRegistry<T>` interface and two factory functions (private and process-wide) that every provider seam in the build—antibot, analytics, payments, OAuth, mail, PDF, etc.—shares. The registry itself is intentionally policy-free: it only stores, lists, and looks up implementations by name. The decision to *throw* on a missing name vs. *return `undefined`* is delegated to the caller via `requireProvider` or a bare `resolve()`, so each port enforces its own failure contract.

## Key elements

- **`ProviderRegistry<T>` (interface)** — The shared seam: `register(name, provider)`, `names()`, `resolve(name): T | undefined`. Every provider registry in the codebase implements this shape.
- **`registryOver` (internal helper)** — Wraps a `Map<string, T>` into the `ProviderRegistry<T>` interface. Not exported.
- **`createProviderRegistry<T>(initial?)`** — Returns a private registry backed by a fresh `Map`. Use when the registry lives in the same module scope as its consumers and will not be reset.
- **`createSharedProviderRegistry<T>(name, initial?)`** — Returns a registry whose backing `Map` is stashed on `globalThis` under a `Symbol.for` key. Survives `jest.resetModules` / `isolateModules`, so test doubles registered once in a `setupFiles` hook or dev-preload script remain visible after module re-evaluation. `initial` entries are applied only on the first (creating) call.
- **`requireProvider<T>(registry, variable, name)`** — Resolves `name` from `registry`; if absent, throws an `Error` that names the env-var selector and lists all registered names. Intended for ports where an unknown name is a typo that must fail loudly (antibot, analytics, payments).
- **`sharedKey` (internal helper)** — Derives the `Symbol.for` key from a registry name. Not exported.

## Relationships

- **Consumed by every adapter and module provider index** (antibot-providers, mail-transports, pdf, pinned-https, analytics, database, settle, OAuth providers, invoicing providers, payments providers/registry): each builds its registry via `createProviderRegistry` or `createSharedProviderRegistry` and exposes implementations to the app tier through the `ProviderRegistry<T>` interface.
- **`requireProvider`** is the enforcement point used by the stricter ports (antibot, analytics, payments) at boot to fail fast on a misconfigured selector variable. The OAuth port deliberately calls `resolve()` instead, treating an absent provider as "not configured" rather than an error.
- The `globalThis`-backed map in `createSharedProviderRegistry` parallels the pattern used by `config/store.ts` for process-wide state.

## Notes

- `T` is deliberately unconstrained. It can be a concrete implementation (antibot, payments) **or** a lazy factory (`() => OAuthProvider | undefined`). The registry never invokes `T`; callers are responsible for calling factories if needed.
- `names()` returns insertion order, which is what appears in `requireProvider`'s error message.
- When seeding a **shared** registry, `initial` is applied only by the first caller. Subsequent calls with the same `name` return the existing map and silently ignore their `initial` argument.
- The registry is a pure storage/lookup structure—no events, no caching, no lifecycle hooks. Any such behavior belongs in the caller.
