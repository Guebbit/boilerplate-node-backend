---
source: src/modules/webhooks/services/index.ts
sha256: b9c1d58ca9970794328ef908f459cea0572f49eadde56b5895a1e2e3f15f22d9
generated_at: 2026-11-14T22:46:58.709044+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/services/index.ts

## Purpose

Barrel export for the webhooks `services/` directory. It aggregates the individual service submodules (subscriptions, deliveries, publish, sweep, reencrypt, attempt, catalog) behind a single `webhooksService` object so that controllers and other module code have one stable import path rather than reaching into seven sibling files directly.

## Key elements

- **`webhooksService`** — the sole runtime export; an object that namespaces every public service function:
  - *Subscription CRUD:* `listSubscriptions`, `createSubscription`, `getSubscription`, `updateSubscription`, `enableSubscription`, `disableSubscription`
  - *Secret management:* `createSubscriptionSecret`, `removeSubscriptionSecret`
  - *Lifecycle:* `removeSubscription`, `forgetOwner`
  - *Deliveries:* `listDeliveries`, `getDelivery`, `replayDelivery`
  - *Event fan-out:* `subscribeToWebhookEvents` (from `./publish`)
  - *Retry sweep:* `sweepDueWebhookDeliveries` (from `./sweep`)
  - *Encryption maintenance:* `reencryptWebhookSecrets` (from `./reencrypt`)
  - *Delivery worker:* `processDeliveryJob` (from `./attempt`)
  - *Catalog:* `listWebhookEventCatalog`, `registerWebhookCatalog` (from `./catalog`)
- **Type re-exports** — `WebhookEventCatalogEntry`, `SubscriptionWithMintedSecrets`, `SubscriptionListFilters`, `DeliveryListFilters` are re-exported so consumers can pull types from this one path.

## Relationships

- All controllers in `src/modules/webhooks/controllers/` (`post-subscription`, `get-subscriptions`, `delete-subscription`, `post-subscription-secret`, `delete-subscription-secret`, `get-delivery`, `get-deliveries`, `post-delivery-replay`, `post-subscription-enable`, `post-subscription-disable`, `get-subscription`, `update-subscription`, `get-events`) import `webhooksService` from this file rather than from the individual submodules.
- `src/modules/webhooks/index.ts` and `src/modules/webhooks/module.ts` sit at the module boundary above this file and are the other aggregation points for the webhooks module.

## Notes

- The docstring mandates that **controllers call through `webhooksService`, never the bare imported functions**. Treat direct imports of `./subscriptions`, `./deliveries`, etc. outside this barrel as a convention violation.
- The directory uses the plural `services/` layout (one file per concern) rather than a single `service.ts`; the rationale is documented in `docs/theory/layers.md#when-service-ts-becomes-services`.
- `attempt.ts` is deliberately shared between the replay path (`deliveries.replay`) and the queued worker (`processDeliveryJob`); the two are distinct functions but operate on the same delivery-attempt core.
