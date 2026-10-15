---
source: src/modules/webhooks/services/index.ts
sha256: feef313abceb8f89fca01f1f209b3db0fda3e5a2f42d44ab9f8e026565b1c612
generated_at: 2026-10-15T12:21:41.426092+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/services/index.ts

## Purpose

Barrel file for the webhooks module's `services/` directory. It re-exports individual service functions and types, and assembles the `webhooksService` object that controllers use to call into the module. Its existence (rather than a single `service.ts`) follows the layering convention described in `docs/theory/layers.md#when-service-ts-becomes-services-`.

## Key elements

- **`webhooksService`** — the primary export; an object grouping the admin-surface operations (`listSubscriptions`, `createSubscription`, `updateSubscription`, `rotateSubscriptionSecret`, `removeSubscriptionSecret`, `removeSubscription`, `listDeliveries`, `replayDelivery`) so controllers have a single entry point.
- **`subscribeToWebhookEvents`** — re-exported from `./publish`; the domain-event fan-out entry point.
- **`sweepDueWebhookDeliveries`** — re-exported from `./sweep`; the retry-sweep operation invoked by `scripts/ops/sweep-webhook-retries.ts`.
- **`reencryptWebhookSecrets`** — re-exported from `./reencrypt`; bulk re-encryption of stored secrets.
- **`processDeliveryJob`** — re-exported from `./attempt`; the shared delivery-execution core used by both the queued worker and `deliveries.replay`.
- **`listWebhookEventCatalogue` / `registerWebhookCatalogue`** — re-exported from `./catalogue`.
- **Type re-exports** — `WebhookEventCatalogueEntry` (from `@types`), `SubscriptionWithMintedSecrets` (from `./subscriptions`), `DeliveryListFilters` (from `./deliveries`).

## Relationships

- **Controllers** (`create-subscription`, `delete-subscription`, `list-deliveries`, `list-events`, `list-subscriptions`, `remove-subscription-secret`, `replay-delivery`, `rotate-subscription-secret`, `update-subscription`) — consume `webhooksService` as their sole call-in path into the service layer; they do not import the underlying `subscriptions` or `deliveries` modules directly.
- **`src/modules/webhooks/index.ts` / `module.ts`** — higher-level module wiring that registers the routes and binds this barrel to the module lifecycle.
- **`services/attempt.ts`** — provides `processDeliveryJob`, which `deliveries.replay` delegates to for the actual HTTP send.
- **`services/deliveries.ts`** — provides `list` and `replay` used inside `webhooksService`.
- **`services/catalogue.ts`** — provides the event-catalogue read/register functions.
- **`services/publish.ts`** — provides the event fan-out (`subscribeToWebhookEvents`).

## Notes

- The doc comment names `subscriptions.ts` and `deliveries.ts` as the two admin-surface resources, but only `deliveries.ts` is imported directly; `subscriptions.ts` is imported as a namespace (`* as subscriptions`) and accessed through `webhooksService`. Treat `webhooksService` as the **only** supported path for controller code.
- `sweep.ts` and `reencrypt.ts` are re-exported here but are **not** part of `webhooksService`; they are standalone operations invoked by ops scripts, not by request handlers.
- The `@types` package is the module-local type namespace; `WebhookEventCatalogueEntry` lives there rather than in a local `.d.ts`.
