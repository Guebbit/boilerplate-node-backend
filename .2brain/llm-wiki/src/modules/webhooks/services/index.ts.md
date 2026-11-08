---
source: src/modules/webhooks/services/index.ts
sha256: bd112c93b25f38e4cccfe8565dd61e3bdb11c4a6e7094d79c07052f5a9610c64
generated_at: 2026-11-08T09:06:32.400524+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/services/index.ts

## Purpose

Barrel module for the webhooks service layer. It aggregates the individual service files (`subscriptions`, `deliveries`, `attempt`, `sweep`, `publish`, `reencrypt`, `catalog`) behind a single `webhooksService` object so that controllers and other callers have one import surface instead of reaching into each file.

## Key elements

- **`webhooksService`** — The single named export. A flat object whose keys are the public webhook operations: subscription CRUD/enable/disable/secret management, delivery list/get/replay, `subscribeToWebhookEvents`, `sweepDueWebhookDeliveries`, `reencryptWebhookSecrets`, `processDeliveryJob`, `listWebhookEventCatalog`, and `registerWebhookCatalog`.
- **Type re-exports** — `WebhookEventCatalogEntry` (from `@types`), `SubscriptionWithMintedSecrets`, `SubscriptionListFilters` (from `./subscriptions`), and `DeliveryListFilters` (from `./deliveries`). These are the filter/shape types consumers need without importing the implementation files directly.

## Relationships

- **All 13 controller files** (e.g. `post-subscription.ts`, `get-deliveries.ts`, `delete-subscription-secret.ts`, …) import `webhooksService` from this file to call their respective operations. They never import the underlying sub-module files directly.
- **`src/modules/webhooks/index.ts`** / **`src/modules/webhooks/module.ts`** — The module registration layer consumes this barrel (or the types it re-exports) to wire the webhooks module into the application.

## Notes

- The JSDoc references `docs/theory/layers.md#when-service-ts-becomes-services-` as the canonical explanation of *why* this module has a `services/` directory rather than a single `service.ts`.
- Convention (stated in the file's own doc comment): split is by *what the operations do* — `subscriptions.ts` and `deliveries.ts` are the two admin-facing resources, `attempt.ts` is shared delivery-execution logic, `sweep.ts` handles the `sweep:webhook-retries` cron, and `publish.ts` is domain-event fan-out.
- Controllers are expected to call through `webhooksService.*`; importing the bare sub-module functions is discouraged (per the inline comment on the export).
