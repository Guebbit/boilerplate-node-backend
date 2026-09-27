---
source: src/modules/webhooks/services/catalogue.ts
sha256: bda5d82ef64c0d763dd4008bfb696b7d9d2ed6374d63a34479769602d8f42d2d
generated_at: 2026-09-27T15:43:43.706505+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/services/catalogue.ts

## Purpose

Provides a static, in-memory list of the webhook events this module can emit, sourced directly from the local `asyncapi.yaml` fragment. By reading the same file that `asyncapi.public.yaml` is generated from, the public event endpoint and the module's actual capabilities cannot drift apart.

## Key elements

- **`catalogue`** (module-level constant) — Parsed once at import time via an IIFE: reads `../asyncapi.yaml` from disk, parses it with `yaml.parse`, and maps `channels` into an array of `{ name, description }` objects. Never re-parsed per request.
- **`listWebhookEventCatalogue()`** (exported function) — Returns the frozen `catalogue` array. This is the sole public API of the module.
- **`AsyncApiChannelsDocument`** (local interface) — Minimal structural type describing the subset of the AsyncAPI YAML this file actually reads (just `channels` with optional `description`).

## Relationships

- **`src/modules/webhooks/controllers/list-events.ts`** — Consumes `listWebhookEventCatalogue()` to populate the `GET /webhooks/events` response.
- **`src/modules/webhooks/services/index.ts`** — Re-exports this module so other services can import the catalogue function through the services barrel.
- **`src/types/index.ts`** — Supplies the `WebhookEventCatalogueEntry` type that shapes both the parsed array and the return type of the exported function.

## Notes

- The YAML file is read **synchronously at import time** using `readFileSync`. There is no caching layer, no watch, and no refresh mechanism — if the YAML changes at runtime (it shouldn't; it's a build-time artifact), the in-memory copy will not update until the process restarts.
- The path resolution uses `__dirname/../asyncapi.yaml`, so the file must sit one directory above this service file. A mis-located YAML will throw at import, crashing the entire module tree.
- Only `channels` and their `description` are extracted; operation IDs, payloads, and other AsyncAPI metadata are intentionally ignored.
