---
source: src/modules/analytics/module.ts
sha256: fec59283af38bad777f05b3321201bbb49cdc2f040497ce83606d86dff3eca1f
generated_at: 2026-10-14T14:55:06.860949+00:00
model: ollama:qwen3.8:27b
---

# src/modules/analytics/module.ts

## Purpose

Module manifest for the browsing-event relay. It exposes `POST /analytics/events`, a single stateless endpoint through which a browser reports UI-level activity (page opens, searches) that the response cache otherwise hides from the server. Those events are forwarded to an analytics provider via the shared consent gate. Business-fact events (cart, checkout, order, payment, signup, login) are explicitly **not** accepted here; they are emitted by the owning service.

## Key elements

- **`onRegistered(modules)`** — lifecycle hook called after all enabled modules are known. Calls `resolveBrowserEvents(modules)` from the kernel registry to collect the browser events declared by every other module, then passes the result to `registerBrowserEvents`. This indirection exists because the relay cannot statically import the modules that own the events.
- **Default export** — the `AppModule` manifest:
  - `name: 'analytics'`, `basePath: '/analytics'`
  - `routes: router` (imported from `./routes`)
  - `onRegistered` hook as above
  - `personalData: 'none'` — the module is stateless; events are forwarded and never stored in-app.

## Relationships

- **`src/kernel/registry.ts`** — provides the `resolveBrowserEvents` helper and the `AppModule` type used to satisfy the manifest. The relay depends on the kernel to discover declared events at registration time rather than importing owning modules directly.
- **`src/modules.ts`** — the top-level module registration list where this analytics module is enabled and, during the `onRegistered` phase, passes the full module array to the analytics hook.
- **`src/modules/analytics/routes.ts`** — supplies the Hono (or equivalent) `router` instance that defines the `POST /events` handler; the manifest simply re-exports it under the `/analytics` base path.
- **`src/modules/analytics/services/relay.ts`** — implements `registerBrowserEvents`, the function that wires collected browser-event descriptors to the consent-gated forward-to-provider logic.

## Notes

- The relay is deliberately **stateless** (`personalData: 'none'`). If you need to persist or inspect forwarded events, that belongs outside this module.
- The `onRegistered` pattern means event discovery is **registration-order dependent**: a module must be enabled before the analytics hook fires, or its declared browser events will be missed.
- Do **not** add business-fact event handlers here. The module's contract is UI/activity telemetry only; business facts are the responsibility of the emitting service.
