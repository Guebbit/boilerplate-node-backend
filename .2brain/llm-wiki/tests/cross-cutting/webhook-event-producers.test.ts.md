---
source: tests/cross-cutting/webhook-event-producers.test.ts
sha256: f9e062225920344b57124d9da4a11dc3d2058591a2608d38aa05ee273b00a669
generated_at: 2026-11-08T09:33:55.655857+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/webhook-event-producers.test.ts

## Purpose

Integration test that proves, by actual execution rather than source inspection, that every public webhook event declared in the registered modules' `asyncapi.webhooks.yaml` fragments has a real producer, and that no producer fires an event the catalogue does not declare. It drives the domain-event bus through the real kernel registry so that `webhooks/module.ts`'s `onRegistered` hook wires subscribers the same way production does.

## Key elements

- **`ORDER_ID` / `PAYMENT_ID`** — Distinct synthetic 24-char hex strings used as Mongo-shaped IDs so that a payment's `orderId` field is never mistaken for the order's own identity.
- **`REGISTERED_OWNERS`** — Tuple `['orders','payments','returns','example','users']`; the set of modules whose AsyncAPI fragments define the expected event catalogue.
- **`declaredCatalog()`** — Calls the shared `declaredWebhookEvents` helper (from `@tests/webhook-events`) to get the expected event-name list.
- **`createCatchAllSubscription()`** — Creates a `webhookSubscriptionRepository` entry with `eventTypes: ['*']` and a fresh ring secret, so any fan-out is captured.
- **`describe` block** — Two test cases:
  1. Emits every relevant domain event (orders, users, payments, returns, example) and asserts the set of `eventType` values on the resulting `webhookDeliveryRepository` rows equals the declared catalogue (sorted, bidirectional).
  2. Asserts `webhooksService.listWebhookEventCatalog()` names match the same catalogue.

## Relationships

- **`src/kernel/events.ts`** — `emitDomainEvent` / `resetDomainEvents` drive and clean the in-memory domain-event bus.
- **`src/kernel/registry.ts`** — `registerModules` performs the real registry indirection; `webhooks/module.ts` reads other modules' `publicEvents` from it during `onRegistered`.
- **`src/modules/orders/index.ts` + `module.ts`** — Exports `ORDER_CREATED`, `ORDER_STATUS_CHANGED`, `ORDER_CANCELED`, `ORDER_REDACTED` and the module instance for registration.
- **`src/modules/payments/index.ts` + `module.ts`** — Exports the seven `PAYMENT_*` constants and the module instance.
- **`src/modules/users/index.ts` + `module.ts`** — Exports `USER_ERASED`, `USER_PROFILE_CHANGED` and the module instance.
- **`src/modules/returns/index.ts` + `module.ts`** — Exports `RETURN_REQUESTED`, `RETURN_RECEIVED`, `RETURN_CLOSED` and the module instance.
- **`src/modules/example/index.ts` + `module.ts`** — Exports `EXAMPLE_PUBLISHED` and the module instance.
- **`src/modules/webhooks/module.ts`** — The subscriber under test; its `onRegistered` hook resolves `publicEvents` from the registry and wires the generic fan-out.
- **`src/modules/webhooks/repository.ts`** — `webhookSubscriptionRepository` (create catch-all) and `webhookDeliveryRepository` (read back produced deliveries).
- **`src/modules/webhooks/secrets.ts`** — `mintRingSecret` generates the cryptographic ring secret stored on the subscription.

## Notes

- **All modules must be registered, not just `webhooks`.** `webhooks/module.ts`'s `onRegistered` hook looks up other modules' `publicEvents` in the registry; registering only the webhooks module would resolve an empty set and produce zero deliveries.
- **`ORDER_STATUS_CHANGED` is emitted twice** (with different `from`/`to` pairs) because it projects to two distinct public events (`order.paid`, `order.shipped`).
- Comparisons use `.toSorted()` to make the assertion order-independent.
- The test does not use HTTP; it operates entirely through the domain-event bus and the repository layer.
