---
source: src/modules/analytics/module.ts
sha256: 173943fa4db02b1da755cb8dd4ec8af60887ab233012116462288ddbfacef6a9
generated_at: 2026-11-08T04:58:52.811966+00:00
model: ollama:qwen3.8:27b
---

# src/modules/analytics/module.ts

## Purpose

Module manifest for the analytics relay. Wires together the `POST /analytics/events` route, the analytics service, and the browser-event collection hook so the app can forward consent-gated, browser-reported interaction events (page views, searches) to an external analytics provider. Business events (cart, order, payment, etc.) are explicitly out of scope — they are emitted by the services that perform them.

## Key elements

- **`onRegistered(modules)`** – Lifecycle hook called after all enabled modules are known. Calls `resolveBrowserEvents(modules)` (from the kernel) to collect the browser-event descriptors each module declares, then passes the result to `analyticsService.registerBrowserEvents`. This indirection is required because the relay cannot statically import the modules that own those events.
- **`export default { … } satisfies AppModule`** – The module manifest object. Declares `name: 'analytics'`, a single mount at `/analytics` backed by the local `router`, the `onRegistered` hook above, and `personalData: 'none'` (events are forwarded and stored nowhere in this app).

## Relationships

- **`src/kernel/registry.ts`** — Imports `resolveBrowserEvents` and the `AppModule` type. The kernel is the only place that knows the full set of enabled modules; this file consumes that knowledge through the `onRegistered` callback.
- **`src/modules.ts`** — Presumably the top-level module collector that invokes each module's `onRegistered` hook in registration order after all modules are loaded.
- **`src/modules/analytics/routes.ts`** — Supplies the `router` that is mounted under `/analytics`. Defines the `POST /events` endpoint.
- **`src/modules/analytics/services/index.ts`** — Supplies `analyticsService`, the object that actually forwards events to the provider and exposes `registerBrowserEvents`.
- **`src/modules/analytics/openapi.yaml`** — OpenAPI specification describing the public analytics routes (the single `POST /analytics/events` endpoint).

## Notes

- The module is **stateless** by design (`personalData: 'none'`): it never persists an event locally. Any storage lives in the external provider.
- The `onRegistered` hook exists specifically to break an import cycle: the relay must accept events declared by *other* modules, so it discovers them at registration time rather than at import time.
- The JSDoc explicitly forbids accepting business-fact events through this endpoint; if a new event type is added to a module's `browserEvents` declaration, it will flow through here automatically once that module is enabled.
