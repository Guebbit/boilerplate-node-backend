---
source: src/modules/webhooks/services/catalog.ts
sha256: 77f392bace29792e004745647e6bea1a7cf03f298cbd52a565bbb5a9d568a797
generated_at: 2026-11-08T09:06:00.646457+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/services/catalog.ts

## Purpose

Builds the public webhook event catalogue by reading each registered module's `asyncapi.webhooks.yaml` fragment once at boot. The resulting in-memory list serves the `GET /webhooks/events` endpoint and powers subscription validation, guaranteeing that the listed events, the subscribe check, and the bundled AsyncAPI contract all derive from the same per-module files.

## Key elements

- **`registerWebhookCatalog(moduleNames)`** — called once during `onRegistered` (after all modules are known). Reads each module's YAML fragment, flattens channel entries into the module-level `catalogue` array.
- **`listWebhookEventCatalog()`** — returns the readonly catalogue for public consumption (e.g. the events endpoint).
- **`unknownEventTypes(eventTypes)`** — validates a subscription's event filter against the catalogue; returns the names that are neither in the catalogue nor the `*` wildcard (`ALL_EVENTS`). Deduplicates while preserving request order.
- **`eventsOf(moduleName)`** *(internal)* — reads and parses a single module's `asyncapi.webhooks.yaml` from disk; returns `[]` if the file is absent.
- **`catalogue`** *(module-level)* — the mutable store, empty until `registerWebhookCatalog` runs.

## Relationships

- **`src/modules/webhooks/domain/index.ts`** — provides `ALL_EVENTS`, the `*` constant that `unknownEventTypes` always allows.
- **`src/modules/webhooks/services/index.ts`** — barrel that re-exports this module's public API to the rest of the webhooks service layer.
- **`src/modules/webhooks/services/subscriptions.ts`** — calls `unknownEventTypes` when validating a new or updated subscription's event filter.
- **`src/types/index.ts`** — source of the `WebhookEventCatalogEntry` and `WebhookEventName` types used throughout.
- **`src/modules/webhooks/tests/unit/catalog.test.ts`** — unit tests for the catalogue functions.
- **`src/modules/webhooks/tests/integration/subscription-lifecycle.test.ts`** — integration tests exercising subscription flows that depend on the catalogue.

## Notes

- The catalogue is populated once at boot; subsequent reads are pure memory access (no disk I/O per request).
- Module names are folder names under `src/modules/` (matching `AppModule.name`); the file path is derived as `<module>/asyncapi.webhooks.yaml`.
- The `as WebhookEventName` cast on the channel key is unavoidable: the enum is generated from the same YAML files at bundle time (`npm run contracts:bundle`), so the compiler cannot verify a disk-read string against it.
- A module that is not registered (or ships no fragment file) simply contributes zero events — there is no fallback or warning.
