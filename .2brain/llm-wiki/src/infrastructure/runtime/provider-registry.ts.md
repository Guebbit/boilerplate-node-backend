---
source: src/infrastructure/runtime/provider-registry.ts
sha256: 919b7cfbd15ea5b23a8ef87d6d7e034b52eb9b8013a3987fae05cbd4a09a3db2
generated_at: 2026-11-14T18:17:11.342141+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/runtime/provider-registry.ts

## Purpose

Defines the generic named-lookup seam shared by every provider family in this build (antibot, analytics, payments, OAuth, mail, etc.). It supplies the `ProviderRegistry<T>` interface, two factory functions (private and process-shared), and a `requireProvider` helper. Resolution *policy* (throw vs. return `undefined`) is deliberately left to each caller.

## Key elements

- **`ProviderRegistry<T>`** — Interface: `register(name, provider)`, `names()`, `resolve(name): T | undefined`.
- **`registryOver`** (internal) — Wraps a `Map<string, T>` into a `ProviderRegistry<T>` object.
- **`createProviderRegistry<T>(initial?)`** — Creates a private, module-scoped registry seeded with the given `Record<string, T>`.
- **`createSharedProviderRegistry<T>(name, initial?)`** — Creates (or retrieves) a process-wide registry keyed by a `Symbol.for` slot on `globalThis`, so it survives `jest.resetModules` / `isolateModules`.
- **`requireProvider<T>(registry, variable, name)`** — Resolves `name` or throws an `Error` listing all registered names; intended for ports where an unknown name is a bug (antibot, analytics, payments).

## Relationships

- **`src/infrastructure/adapters/antibot-providers/index.ts`**, **`src/infrastructure/observability/analytics/index.ts`**, **`src/modules/payments/providers/index.ts`**, **`src/modules/payments/providers/registry.ts`** — Each of these ports creates a registry (typically via `createSharedProviderRegistry`) and calls `requireProvider` at boot to fail fast on a misnamed selector.
- **`src/modules/account/oauth/providers/index.ts`** — Registers OAuth provider factories (`() => OAuthProvider | undefined`) and resolves them with a plain `resolve()` call, treating `undefined` as "not configured."
- **`src/infrastructure/adapters/mail-transports.ts`**, **`src/infrastructure/adapters/pdf.ts`**, **`src/infrastructure/adapters/pinned-https.ts`** — Consume or register implementations through the same `ProviderRegistry<T>` shape.
- **`src/infrastructure/runtime/settle.ts`** — Part of the same runtime layer; may resolve providers during the settle/shutdown phase.
- **`src/modules/invoicing/providers/index.ts`** — Follows the same register/resolve pattern for invoicing implementations.

## Notes

- `T` is intentionally unconstrained. For OAuth it holds a *factory* (`() => OAuthProvider | undefined`); the registry stores and returns values but **never invokes** them.
- `createSharedProviderRegistry` seeds `initial` only on first creation (`??=`). Subsequent calls in the same process with the same `name` return the existing map unchanged.
- The `globalThis` + `Symbol.for` pattern mirrors the config store in `config/store.ts`; both exist so test doubles registered in `setupFiles` or a dev preload survive Jest module isolation.
- `names()` returns insertion order (Map semantics), which is what appears in `requireProvider`'s error message.
