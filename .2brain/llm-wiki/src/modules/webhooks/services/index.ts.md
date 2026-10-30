---
source: src/modules/webhooks/services/index.ts
sha256: a3a908bb8b8dbfc53f111316398aa27ba22d8ba3da77f555b827c428ba4842f5
generated_at: 2026-10-29T06:30:11.703113+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/services/index.ts

## Purpose

Barrel export for the webhooks module's `services/` directory. It aggregates every service operation (subscriptions CRUD, deliveries, delivery attempt, retry sweep, event fan-out, secret re-encryption, and the event catalogue) into a single `webhooksService` object so controllers have one consistent entry point instead of importing bare functions from individual files.

## Key elements

- **`webhooksService`** (exported const) — the sole named export consumed by controllers. Maps ~18 operations to their underlying implementations:
  - *Subscriptions*: `list`, `create`, `getById`, `update`, `enable`, `disable`, `createSecret`, `removeSecret`, `remove`, `forgetOwner`
  - *Deliveries*: `list`, `get`, `replay`
  - *Delivery core*: `processDeliveryJob` (shared by replay and the queued worker)
  - *Ops*: `sweepDueWebhookDeliveries` (retry sweep), `reencryptWebhookSecrets`
  - *Events*: `subscribeToWebhookEvents` (fan-out), `listWebhookEventCatalogue`, `registerWebhookCatalogue`
- **Re-exported types** — `WebhookEventCatalogueEntry`, `SubscriptionWithMintedSecrets`, `SubscriptionListFilters`, `DeliveryListFilters`

## Relationships

- **Consumed by** all webhook controllers (`create-subscription`, `update-subscription`, `list-subscriptions`, `replay-delivery`, `list-deliveries`, etc.) which import `webhooksService` from this file rather than reaching into sibling service files directly.
- **Re-exported by** `src/modules/webhooks/index.ts`, which is the module's public surface.
- **Referenced by** `src/modules/webhooks/module.ts`, the NestJS module that provides/injects the service layer.
- **Delegates to** sibling files (`subscriptions.ts`, `deliveries.ts`, `publish.ts`, `sweep.ts`, `reencrypt.ts`, `attempt.ts`, `catalogue.ts`) — this file adds no logic beyond naming and grouping.

## Notes

- Controllers must call through `webhooksService.<method>` and **never** import the bare functions from the sibling files (stated explicitly in the JSDoc comment).
- The file uses `import * as ns` namespace imports, so internal function names (e.g. `subscriptions.getById`) are aliased to flatter public names (e.g. `getSubscription`) on the export object.
- Per the header doc-comment, the split into multiple service files (vs. a single `service.ts`) follows the convention described in `docs/theory/layers.md#when-service-ts-becomes-services-`.
