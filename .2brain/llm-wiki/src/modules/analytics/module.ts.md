---
source: src/modules/analytics/module.ts
source_sha256: f8dcff79215a5a712f55dacccb772d1ce403e7e080c3ef0fc3ff000eb9011605
context_sha256: 80be31cf113ef701920f8dcab7296040575b43b63828ea1bf38dc01e1caba246
generated_at: 2026-11-22T04:17:55.884281+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/analytics/module.ts

## Purpose
Manifest entry for the `analytics` module: the browsing-event relay behind `POST /analytics/events`. A browser reports things the response cache hides from the server (a product page opened, a search made), and the server forwards them to the analytics provider through the same consent gate as every other event. Business facts (cart, checkout, order, payment, signup, login) are never accepted here; the service that makes them true emits them.

## Key elements
- **default export** – the module manifest, declared with `satisfies AppModule`:
  - `name: 'analytics'`
  - `mounts`: a single mount at `/analytics` serving `router`
  - `onRegistered`: lifecycle hook (see below)
  - `personalData: 'none'`: the module is stateless, so events are forwarded to the provider and not stored in this app
- **`onRegistered(modules)`** – called once every enabled module is known. It calls `resolveBrowserEvents(modules)` to collect the browser events those modules declare, then passes the result to `analyticsService.registerBrowserEvents(...)`.

## Relationships
- `src/kernel/registry.ts` – provides the `AppModule` type and `resolveBrowserEvents`, which gathers browser-event declarations from all enabled modules.
- `src/modules/analytics/routes.ts` – provides `router`, mounted at `/analytics`.
- `src/modules/analytics/services/index.ts` – provides `analyticsService`, which receives the resolved browser events.
- `src/modules.ts` – presumably where module manifests are listed and registered. This file only shows that `onRegistered` receives the enabled modules "in registration order".

## Notes
- Event declarations are collected at registration time because the relay cannot import the modules that own them.
- The manifest has no persistence and no locales; it exposes one public route.
