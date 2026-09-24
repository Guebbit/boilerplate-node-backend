---
source: src/modules/webhooks/services/index.ts
sha256: 8899eaf9f063330e1e59d851408b619ab3a5f6234246a99c435a4c1bd3826457
generated_at: 2026-09-23T19:42:32.530898+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/services/index.ts

## Purpose

Barrel (re-export) file for the webhooks `services/` directory. It is the single import surface that controllers and the module wiring use to reach the service layer, so that callers never import bare functions from individual sibling files. The doc comment points to `docs/theory/layers.md#when-service-ts-becomes-services-` for the rationale behind splitting into multiple service files.

## Key elements

- **`webhooksService`** — a plain object that groups the six admin-surface CRUD operations (`listSubscriptions`, `createSubscription`, `updateSubscription`, `removeSubscription`, `listDeliveries`, `replayDelivery`) pulled from `subscriptions.ts` and `deliveries.ts`. Controllers are expected to call through this object rather than importing the underlying functions directly.
- **Re-exported functions** — `subscribeToWebhookEvents` (from `publish`), `sweepDueWebhookDeliveries` (from `sweep`), `processDeliveryJob` (from `attempt`), and `listWebhookEventCatalogue` (from `catalogue`). These are the non-CRUD entry points (event fan-out, retry sweep, delivery worker, catalogue lookup).
- **Re-exported types** — `WebhookEventCatalogueEntry` (from `@types`), `SubscriptionWithMintedSecrets` (from `subscriptions`), and `DeliveryListFilters` (from `deliveries`).

## Relationships

- **Controllers** (`create-subscription`, `delete-subscription`, `list-deliveries`, `list-events`, `list-subscriptions`, `replay-delivery`, `update-subscription`) — import `webhooksService` (or the individual re-exported functions) from this file to perform their operations. This file is the contract boundary between the controller and service layers.
- **`src/modules/webhooks/index.ts` / `module.ts`** — wire the module together; this file provides the service-layer exports they register or re-expose.
- **Sibling service files** (`subscriptions`, `deliveries`, `attempt`, `catalogue`, `publish`, `sweep`) — the actual implementations. This file imports `subscriptions` and `deliveries` as namespaces to build `webhooksService`, and re-exports named functions/types from the remaining four.

## Notes

- The file imports `subscriptions` and `deliveries` only to compose the `webhooksService` object; all other re-exports are named `export … from` statements that do not retain a local binding.
- The `webhooksService` object intentionally exposes *only* the six admin-surface operations. The event fan-out, sweep, attempt, and catalogue functions are exposed as flat named re-exports instead — they are not part of the CRUD surface.
- Per the inline comment, controllers must go through this barrel ("never the bare functions"). Bypassing it breaks the intended indirection.
