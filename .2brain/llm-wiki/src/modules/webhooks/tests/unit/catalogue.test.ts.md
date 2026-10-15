---
source: src/modules/webhooks/tests/unit/catalogue.test.ts
sha256: dcb962b49e79dc8d76d0d70b454f5cd50acff15d80d7004c90b2061f5e4e6f99
generated_at: 2026-10-15T12:24:45.462327+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/tests/unit/catalogue.test.ts

## Purpose

Unit tests for the webhook event catalogue service. Verifies that only events from explicitly registered modules appear in the catalogue, that per-event descriptions are preserved, and that `unknownEventTypes` correctly identifies (and deduplicates) event names that are not in the registered set.

## Key elements

- **`listedNames()`** – Local helper that calls `listWebhookEventCatalogue()`, maps to event names, and returns them sorted (via `toSorted()`). Used as the primary assertion target.
- **`describe('registerWebhookCatalogue')`** – Four tests covering: empty catalogue by default, listing only events of the modules actually registered, skipping a module that owns no fragment, and carrying the channel `description` string through unchanged.
- **`describe('unknownEventTypes')`** – Three tests covering: wildcard `*` and known names return an empty array; repeated unknown names are deduplicated while preserving request order; an event from a non-registered module is always reported as unknown.

## Relationships

- **`src/modules/webhooks/services/catalogue.ts`** – The system under test. This file imports `listWebhookEventCatalogue`, `registerWebhookCatalogue`, and `unknownEventTypes` from it.
- **`tests/support/webhook-events.ts`** – Provides `declaredWebhookEvents(moduleNames)`, a helper that returns the expected event-name list for a given set of modules. Used to assert that the catalogue contents match the declared events exactly.

## Notes

- State is managed per block: the first `describe` resets the catalogue in `afterEach` by calling `registerWebhookCatalogue([])`; the second `describe` additionally registers `['orders']` in `beforeEach` so its tests start from a known state.
- The deduplication contract of `unknownEventTypes` (each unknown name appears once, in first-occurrence order) is explicitly tested — this is not just a "contains" check.
- `toSorted()` is used instead of `sort()` to keep the original array from `listWebhookEventCatalogue()` unmutated.
