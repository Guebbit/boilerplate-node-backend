---
source: src/infrastructure/runtime/provider-registry.ts
sha256: 4357e201086bbe9363119bf0582e409251f96796ce3ff87fe948485abb2c5ad8
generated_at: 2026-11-08T03:47:28.111638+00:00
model: ollama:qwen3.8:27b
---

# src/infrastructure/runtime/provider-registry.ts

## Purpose

A single, generic registry seam that lets any port—antibot, analytics, payments, OAuth, invoicing, mail—store implementations under a name and look them back up. It exists so every port gets identical register / names / resolve semantics while the *policy* for an unknown name (hard-fail vs. tolerate `undefined`) stays with each caller.

## Key elements

- **`ProviderRegistry<T>`** (interface) — the three-method contract: `register(name, provider)`, `names()`, `resolve(name)`. `resolve` returns `T | undefined`; it never throws.
- **`registryOver<T>(providers: Map)`** — internal adapter that wraps a `Map<string, T>` into the interface. Not exported.
- **`createProviderRegistry<T>(initial?)`** — factory that builds a private, per-module-instance registry seeded with `initial` entries.
- **`createSharedProviderRegistry<T>(name, initial?)`** — factory that hangs the backing `Map` on `globalThis` under a `Symbol.for` key, so every copy of this module in the process (and surviving `jest.resetModules` / `isolateModules`) shares the same table. `initial` is applied only by the first caller.
- **`requireProvider<T>(registry, variable, name)`** — resolve-or-throw helper for ports where an unknown name is a typo that must not silently downgrade a control (antibot, analytics, payments). The error message lists `registry.names()` as the allowed set.
- **`sharedKey(name)`** — internal helper producing the `Symbol.for` key. Not exported.

## Relationships

- **Consumers (they import from this file):** `src/modules/payments/providers/registry.ts`, `src/modules/payments/providers/index.ts`, `src/modules/account/oauth/providers/index.ts`, `src/modules/invoicing/providers/index.ts`, `src/infrastructure/adapters/antibot-providers/index.ts`, `src/infrastructure/observability/analytics/index.ts` — each creates or reads a registry for its port.
- **Test doubles registered at boot:** `src/infrastructure/adapters/mail-transports.ts`, `src/infrastructure/adapters/pdf.ts`, `src/infrastructure/adapters/pinned-https.ts` — referenced in module comments as fakes (e.g. a mail log) registered before the application loads; they rely on `createSharedProviderRegistry` to survive module isolation.
- **Same runtime directory:** `src/infrastructure/runtime/database.ts`, `src/infrastructure/runtime/settle.ts` — siblings in the runtime layer; no direct import is visible in this file.

## Notes

- **`T` is unconstrained by design.** For most ports it is the implementation itself; for OAuth it is a lazy factory (`() => OAuthProvider | undefined`) because multiple providers can be active and "configured" can change between calls. The registry only stores and retrieves—it never invokes `T`.
- **Resolution policy is the caller's choice.** `requireProvider` throws on miss; a bare `resolve()` returns `undefined`. The registry itself never decides.
- **Shared registries persist across Jest module resets** because the `Map` lives on `globalThis`, keyed by `Symbol.for("boilerplate-node-backend.provider-registry.<name>")`. A plain `createProviderRegistry` map would be re-evaluated and lost under `jest.resetModules`.
- **`names()` preserves insertion order** (inherited from `Map`), which is what `requireProvider`'s error message relies on for a stable "Allowed: …" list.
