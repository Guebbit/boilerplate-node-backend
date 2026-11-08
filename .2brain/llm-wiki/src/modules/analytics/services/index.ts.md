---
source: src/modules/analytics/services/index.ts
sha256: c393cf78e5058cb1099f7d6061552252e1cb6977b7390d8b9a1de09affc80c04
generated_at: 2026-11-08T04:59:16.106239+00:00
model: ollama:qwen3.8:27b
---

# src/modules/analytics/services/index.ts

## Purpose

Barrel file for the analytics services layer. It re-exports the browser-event relay functions from `./relay` as a single `analyticsService` object, providing a stable public surface for the rest of the analytics module.

## Key elements

- **`analyticsService`** (exported const) — Flat namespace object bundling two relay functions:
  - `registerBrowserEvents` — registers the browser events the relay accepts.
  - `relayEvent` — relays a single event.
- Both functions are imported directly from `./relay` and passed through without modification.

## Relationships

- **`src/modules/analytics/services/relay.ts`** — Source of the two imported functions; this file is a thin re-export wrapper around it.
- **`src/modules/analytics/index.ts`** — Consumes `analyticsService` to expose it as part of the module's public API.
- **`src/modules/analytics/module.ts`** — Wires the service into the module (likely calls `registerBrowserEvents` during bootstrap).
- **`src/modules/analytics/controllers/post-analytics-event.ts`** — Controller that invokes `relayEvent` via this export to forward events.

## Notes

- The export shape is a single object (`analyticsService.registerBrowserEvents`), **not** individual named re-exports. Consumers must either destructure or use dot notation; `import { relayEvent } from '…/services'` will fail.
- JSDoc labels this "the module's one door," signaling it is the intended entry point for service access—prefer importing from here over reaching into `./relay` directly.
