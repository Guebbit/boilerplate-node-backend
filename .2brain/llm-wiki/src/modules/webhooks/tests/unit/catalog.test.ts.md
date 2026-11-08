---
source: src/modules/webhooks/tests/unit/catalog.test.ts
sha256: edb47e4cb04e721e81fb5dc486135eb1c7ac6741aba379d9eda885fd9e9028d6
generated_at: 2026-11-08T09:10:01.254499+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/tests/unit/catalog.test.ts

## Purpose

Unit tests for the webhook event catalogue service. They verify that the catalogue only surfaces events from *registered* modules, that unregistered modules contribute nothing, and that the subscribe-time check (`unknownEventTypes`) correctly accepts listed names and the wildcard while flagging anything else.

## Key elements

- **`listedNames()`** – local helper that calls `listWebhookEventCatalog()` and returns the sorted array of event `name` strings for concise assertions.
- **`describe('registerWebhookCatalog')`** – four cases covering: empty catalog after reset, catalog limited to the supplied module names, a registered module with no fragment being skipped, and per-channel description pass-through.
- **`describe('unknownEventTypes')`** – three cases covering: wildcard `'*'` and listed names produce no unknowns; duplicates are collapsed while preserving first-seen request order; events from an unregistered module are flagged.

## Relationships

- **`src/modules/webhooks/services/catalog.ts`** – the module under test. The file imports `listWebhookEventCatalog`, `registerWebhookCatalog`, and `unknownEventTypes` from here.
- **`tests/support/webhook-events.ts`** – provides `declaredWebhookEvents(modules)`, a shared fixture that returns the canonical list of event names a given set of module(s) declares. Used as the expected-value source so tests don't hard-code event lists.

## Notes

- Catalogue state is **not** truly isolated by Jest module mocks; the tests rely on `registerWebhookCatalog([])` in `afterEach` to reset between cases. The `unknownEventTypes` block additionally sets up its fixture in `beforeEach`.
- The wildcard `'*'` is always considered known and never appears in the `unknownEventTypes` result.
- `unknownEventTypes` deduplicates its output (repeats of the same unknown name appear once) but preserves the order in which names first appear in the input array.
