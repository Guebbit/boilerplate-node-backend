---
source: src/infrastructure/runtime/provider-registry.ts
sha256: 452deccd81470659c0ddf574bd1e36f22499027149d3f681c88e6500d77cacc3
generated_at: 2026-10-14T08:14:42.520843+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/runtime/provider-registry.ts

## Purpose

A single generic, named-table abstraction that unifies the "name in, implementation out" shape previously duplicated across the antibot, analytics, payments, and OAuth ports. It provides registration, listing, and lookup; the *resolution policy* (throw on unknown name vs. return `undefined`) is deliberately left to each caller.

## Key elements

- **`ProviderRegistry<T>`** (interface) — the three-method seam: `register(name, provider)`, `names()`, `resolve(name)`. `resolve` returns `T | undefined`; it never throws.
- **`registryOver<T>(map)`** (private helper) — wraps a `Map<string, T>` into a `ProviderRegistry`. Shared by both public factory functions.
- **`createProviderRegistry<T>(initial?)`** — returns a standalone registry backed by a fresh `Map`. `T` is unconstrained (plain objects or lazy factories like OAuth's `() => Provider | undefined`).
- **`createSharedProviderRegistry<T>(name, initial?)`** — returns a registry whose backing map lives on `globalThis` under a `Symbol.for` key, so every module instance in the process sees the same registrations. `initial` is applied only on first creation (`??=`).
- **`requireProvider<T>(registry, variable, name)`** — resolves via `registry.resolve(name)` and **throws** an `Error` listing all registered names when the lookup is `undefined`. Used by ports where an unknown name is a typo that must fail loudly (antibot, analytics, payments).

## Relationships

- **`src/infrastructure/adapters/antibot-providers/index.ts`**, **`src/infrastructure/observability/analytics/index.ts`**, **`src/modules/payments/providers/index.ts`**, **`src/modules/invoicing/providers/index.ts`**, **`src/modules/payments/providers/registry.ts`** — consume the registry and call `requireProvider` for strict, fail-fast resolution at boot.
- **`src/modules/account/oauth/providers/index.ts`** — consumes the registry but calls plain `resolve()`, treating an unregistered name as "not configured" rather than an error.
- **`scenarios/flows/backdate.ts`**, **`scenarios/run-server.ts`**, **`scripts/testing/run-prism-smoke-test.ts`** — register test doubles (fake payment provider, mail log, etc.) via `createSharedProviderRegistry` *before* the application loads, so the doubles survive module resets.
- **`src/infrastructure/adapters/mail-transports.ts`**, **`src/infrastructure/adapters/pdf.ts`**, **`src/infrastructure/adapters/pinned-https.ts`** — adjacent adapter modules in the same runtime/infrastructure layer; they are registered into or resolved from a provider registry by their respective ports.
- **`src/infrastructure/runtime/database.ts`**, **`src/infrastructure/runtime/settle.ts`** — sibling runtime modules; no direct import relationship is visible in this file.

## Notes

- **`globalThis` + `Symbol.for` for shared registries.** The backing map is deliberately stored outside module scope so it survives `jest.resetModules` / `isolateModules`. The `initial` record is seeded only on the *first* call for a given `name`; later calls with the same name get the existing map and their `initial` argument is ignored.
- **`T` is intentionally unconstrained.** The registry stores and looks up values without ever invoking them. This is what lets OAuth store a factory (`() => Provider | undefined`) while other ports store concrete implementations.
- **`names()` preserves insertion order** because it spreads `Map.keys()`, which are ordered by insertion.
- **Resolution policy is a caller concern, not a registry concern.** The same `resolve()` method serves both the strict (`requireProvider`) and lenient (OAuth) paths; the registry itself never throws.
