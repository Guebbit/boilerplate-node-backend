---
source: src/modules/analytics/module.ts
sha256: 173943fa4db02b1da755cb8dd4ec8af60887ab233012116462288ddbfacef6a9
generated_at: 2026-10-29T03:11:27.529373+00:00
model: ollama:qwen3.8:27b
---

# src/modules/analytics/module.ts

## Purpose

Module manifest that wires the analytics browsing-event relay into the kernel. It mounts the `/analytics` route, registers the declared browser events (product page opened, search made, etc.) with the analytics service after all modules are known, and marks the module as stateless. Business-fact events (cart, checkout, order, payment, signup, login) are explicitly out of scope here.

## Key elements

- **`onRegistered(modules)`** — Called by the kernel after all modules are registered. Calls `resolveBrowserEvents(modules)` to collect the events each enabled module declares, then hands them to `analyticsService.registerBrowserEvents`.
- **Default export (`AppModule`)** — The manifest object: name `"analytics"`, one mount at `/analytics` using the local `router`, the `onRegistered` hook, and `personalData: 'none'` (no local persistence).

## Relationships

- **`src/kernel/registry.ts`** — Source of `resolveBrowserEvents` (resolves the browser events declared across modules) and the `AppModule` type that the manifest satisfies.
- **`src/modules/analytics/routes.ts`** — Provides the `router` that is mounted at `/analytics`.
- **`src/modules/analytics/services/index.ts`** — Provides `analyticsService`, the target of `registerBrowserEvents`.
- **`src/modules.ts`** — Aggregates this manifest with other module manifests for the kernel to load and invoke `onRegistered`.

## Notes

- The relay deliberately avoids importing the modules that own the events it relays. It receives them via the `onRegistered` callback so the dependency direction stays kernel → analytics, not analytics → feature modules.
- `personalData: 'none'` is a contract: this module forwards events to an external provider and stores nothing locally. Do not add persistence without re-evaluating that field.
- The manifest uses `satisfies AppModule` rather than a type annotation, preserving the literal shape of the object for consumers while still enforcing the interface.
