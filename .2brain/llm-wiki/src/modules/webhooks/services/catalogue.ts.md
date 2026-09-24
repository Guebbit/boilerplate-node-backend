---
source: src/modules/webhooks/services/catalogue.ts
sha256: 24607e36aec3dfa01c16176b89bf600bdaab5181a2b4edbbce3bfb46b41d98c8
generated_at: 2026-09-23T19:42:09.301721+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/services/catalogue.ts

## Purpose

Exposes a static list of webhook event names and descriptions, sourced from the module's own `asyncapi.yaml` fragment. Because the public endpoint and the fireable events both derive from the same file (which is also the source for `asyncapi.public.yaml` via `npm run contracts:bundle`), the catalogue and the actual capability can never drift apart.

## Key elements

- **`AsyncApiChannelsDocument`** (local interface) — Minimal structural type for the `channels` section of an AsyncAPI document; only `name → { description? }` is consumed.
- **`catalogue`** (module-private `const`, computed at import time via IIFE) — Reads and YAML-parses `../asyncapi.yaml` once per process, then maps channel entries into `readonly WebhookEventCatalogueEntry[]`.
- **`listWebhookEventCatalogue()`** (exported function) — Returns the cached `catalogue` array; no I/O, no mutation.

## Relationships

- **`src/modules/webhooks/controllers/list-events.ts`** — Consumes `listWebhookEventCatalogue` to build the response for `GET /webhooks/events`.
- **`src/modules/webhooks/services/index.ts`** — Barrel file that re-exports this module so other code can import from the services entry point.

## Notes

- The YAML file is resolved relative to the compiled output directory (`path.join(__dirname, '..', 'asyncapi.yaml')`), not the source tree. In a bundled/compiled layout the relative path may differ.
- Parsing happens exactly once per process (at `import` time). There is no invalidation or reload mechanism; a changed `asyncapi.yaml` requires a process restart.
- The returned array is `readonly` at the type level but is a plain JS array at runtime—callers _can_ mutate it if they cast, so treat it as immutable by convention.
