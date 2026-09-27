---
source: src/modules/webhooks/services/index.ts
sha256: fff9da5f4e27fa0b6075eac1e87989291fd0b7b77eb3dcc0b37b51a0f6edcc90
generated_at: 2026-09-27T15:44:17.192306+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/services/index.ts

## Purpose

Barrel/index file for the webhooks module's service layer. It re-exports the public functions and types from the individual service files and assembles the admin-facing operations (`subscriptions.*`, `deliveries.*`) into a single `webhooksService` object, giving controllers one stable import point.

## Key elements

- **`webhooksService`** (const object) — bundles the eight admin operations: `listSubscriptions`, `createSubscription`, `updateSubscription`, `rotateSubscriptionSecret`, `removeSubscriptionSecret`, `removeSubscription`, `listDeliveries`, `replayDelivery`. Controllers import this object rather than reaching into individual service files.
- **`subscribeToWebhookEvents`** — re-exported from `./publish`; the domain-event fan-out entry point.
- **`sweepDueWebhookDeliveries`** — re-exported from `./sweep`; the retry sweep invoked by `scripts/ops/sweep-webhook-retries.ts`.
- **`processDeliveryJob`** — re-exported from `./attempt`; the shared delivery core used by both replay and the queued worker.
- **`listWebhookEventCatalogue`** — re-exported from `./catalogue`.
- **Type re-exports** — `WebhookEventCatalogueEntry` (from `@types`), `SubscriptionWithMintedSecrets` (from `./subscriptions`), `DeliveryListFilters` (from `./deliveries`).

## Relationships

- **All webhooks controllers** (`create-subscription`, `delete-subscription`, `list-deliveries`, `list-events`, `list-subscriptions`, `remove-subscription-secret`, `replay-delivery`, `rotate-subscription-secret`, `update-subscription`) import `webhooksService` (or the individual re-exports) from this file as their sole service-layer entry point.
- **`src/modules/webhooks/index.ts` / `module.ts`** — consume the exports of this file to wire the module's public API and dependency-injection bindings.
- **`attempt.ts`, `catalogue.ts`, `deliveries.ts`, `publish.ts`** — the implementation files whose named exports this barrel re-exports or bundles into `webhooksService`.

## Notes

- The file's module-level doc comment points to `docs/theory/layers.md#when-service-ts-becomes-services-` for the rule of when a module graduates from a single `service.ts` to a `services/` directory.
- The inline comment on `webhooksService` explicitly states: *"controllers call through this, never the bare functions."* Treat the object as the required import surface for admin operations.
- `subscriptions.ts` and `sweep.ts` are also imported/re-exported here but are not listed as graph neighbors in this context; they follow the same barrel pattern as the others.
