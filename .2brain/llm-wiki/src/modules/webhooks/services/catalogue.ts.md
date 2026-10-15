---
source: src/modules/webhooks/services/catalogue.ts
sha256: 0d587f31c85f728be1bbbcb026227b8446856983480ceaed70f4560aef42bc04
generated_at: 2026-10-15T12:21:06.855562+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/services/catalogue.ts

## Purpose

Defines the public webhook event catalogue: the set of events shipped by **registered** modules, read from each module's `asyncapi.webhooks.yaml` fragment at boot. This single source of truth keeps `GET /webhooks/events`, subscription validation, and the bundled public contract (`asyncapi.public.yaml`) from drifting apart.

## Key elements

- **`registerWebhookCatalogue(moduleNames)`** — Called once from the module's `onRegistered` hook. Iterates the given module names, reads each module's `asyncapi.webhooks.yaml`, and flattens all channel entries into the module-level `catalogue` array.
- **`listWebhookEventCatalogue()`** — Returns the full `readonly WebhookEventCatalogueEntry[]` (name + description). Intended for the `GET /webhooks/events` endpoint.
- **`unknownEventTypes(eventTypes)`** — Given a subscription's event filter, returns the names not present in the catalogue (deduplicated, request order). The wildcard `ALL_EVENTS` (`*`) is always treated as valid.
- **`eventsOf(moduleName)`** *(private)* — Resolves `src/modules/<moduleName>/asyncapi.webhooks.yaml`, parses it with `yaml.parse`, and extracts channel names/descriptions. Returns `[]` if the file is absent.
- **`catalogue`** *(module-level mutable)* — Populated by `registerWebhookCatalogue`; empty until that call.

## Relationships

- **`src/modules/webhooks/module.ts`** — Invokes `registerWebhookCatalogue` during its `onRegistered` lifecycle, passing the list of enabled module names.
- **`src/modules/webhooks/domain/index.ts`** — Provides the `ALL_EVENTS` constant used in `unknownEventTypes`.
- **`src/modules/webhooks/controllers/list-events.ts`** — Consumes `listWebhookEventCatalogue()` to serve the events listing endpoint.
- **`src/modules/webhooks/services/subscriptions.ts`** — Calls `unknownEventTypes()` to validate a subscription's event filter before persisting it.
- **`src/modules/webhooks/services/index.ts`** — Re-exports this module's public API.
- **`src/types/index.ts`** — Source of the `WebhookEventCatalogueEntry` type imported here.
- **`src/modules/webhooks/tests/unit/catalogue.test.ts`** — Unit tests for `registerWebhookCatalogue`, `listWebhookEventCatalogue`, and `unknownEventTypes`.
- **`src/modules/webhooks/tests/integration/subscription-lifecycle.test.ts`** — Exercises subscription validation that depends on the catalogue.
- **`tests/cross-cutting/webhook-event-producers.test.ts`** — Verifies that producers emit events present in the catalogue.

## Notes

- **Build-time vs. request-time:** The YAML fragments are read once at boot. No `fs` call happens per request.
- **Folder = registry name:** A module's directory under `src/modules/` must match its `AppModule.name`; there is no separate mapping.
- **Minimal YAML contract:** Only the `channels` map and each channel's `description` field are read. Other AsyncAPI fields are ignored.
- **Unregistered modules contribute nothing:** If a module is not in the `moduleNames` list (or its fragment file is missing), its events simply don't appear.
- **`*` is a special case:** `ALL_EVENTS` is never flagged as unknown, so a subscription filtering on `*` always passes regardless of catalogue contents.
