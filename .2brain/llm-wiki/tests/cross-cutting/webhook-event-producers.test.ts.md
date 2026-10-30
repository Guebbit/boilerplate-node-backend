---
source: tests/cross-cutting/webhook-event-producers.test.ts
sha256: b9930c4034dccdeeb6438fff094d3b94d52e41f57a28f801e7c706e9c627239a
generated_at: 2026-10-29T06:51:06.821393+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/webhook-event-producers.test.ts

## Purpose

Proves a bidirectional invariant in one pass: every public webhook event that the registered modules declare in their `asyncapi.webhooks.yaml` fragments is actually produced by some domain-event emit, **and** no emit produces an event the catalogue does not declare. The test drives the real domain-event bus through the real module registry (no HTTP, no source-text scanning) and asserts set-equality between produced and declared event names.

## Key elements

- **`REGISTERED_OWNERS`** — tuple of module names (`orders`, `payments`, `returns`, `example`, `users`) whose `asyncapi.webhooks.yaml` fragments define the expected event catalogue.
- **`declaredCatalogue()`** — resolves the expected event-name list via the `declaredWebhookEvents` test helper.
- **`createCatchAllSubscription()`** — inserts a subscription row with `eventTypes: ['*']` (using `mintRingSecret` + `webhookSubscriptionRepository`) so any fan-out from the webhooks module is captured in the delivery table.
- **`ORDER_ID` / `PAYMENT_ID`** — fixed, syntactically valid Mongo-oid strings used in synthetic payloads; distinct values prevent a payment's `orderId` from colliding with the order's own id.
- **Main test (`it`)** — emits every domain event from all five modules (notably `ORDER_STATUS_CHANGED` twice, once for `paid` and once for `shipped`), then reads all rows from `webhookDeliveryRepository` and asserts the sorted set of `eventType` values equals the sorted declared catalogue.
- **Second test** — calls `webhooksService.listWebhookEventCatalogue()` and asserts its names match `declaredCatalogue()`, covering the catalogue-listing endpoint in isolation (synchronous, no emits).

## Relationships

- **`src/kernel/events.ts`** — supplies `emitDomainEvent` (the bus the test drives) and `resetDomainEvents` (called in `afterEach`).
- **`src/kernel/registry.ts`** — supplies `registerModules`; the test registers all six modules here so that `webhooks/module.ts`'s `onRegistered` hook can resolve the other modules' `publicEvents` declarations from the live registry.
- **`src/modules/{orders,payments,returns,users,example}/module.ts`** — each is registered; their `publicEvents` manifests are the source data the webhooks module subscribes to.
- **`src/modules/{orders,payments,returns,users,example}/index.ts`** — re-exported domain-event constants used as the `emitDomainEvent` discriminators.
- **`src/modules/webhooks/module.ts`** — the subscriber under test; its `onRegistered` hook wires the generic fan-out from the registry lookup.
- **`src/modules/webhooks/repository.ts`** — `webhookSubscriptionRepository.create` (catch-all subscription) and `webhookDeliveryRepository.findAll` (read-back of produced event types).
- **`src/modules/webhooks/secrets.ts`** — `mintRingSecret` generates the secrets entry required on the subscription row.

## Notes

- `ORDER_STATUS_CHANGED` is emitted **twice** (with `to: 'paid'` and `to: 'shipped'`) because it maps to two distinct public events; omitting either emit would make the produced set a strict subset and fail the test.
- The test registers **all** domain modules, not just `webhooksModule`. Registering only the webhooks module would leave the registry lookup empty and produce zero deliveries.
- `ORDER_ID` doubles as the `userId` in user-event payloads — it is shape-valid (24-hex Mongo oid) but semantically unrelated to a real user; this is intentional to keep the test self-contained.
- The second test (`GET /webhooks/events`) is purely a catalogue-consistency check; it does not emit any events and depends only on `webhooksService.listWebhookEventCatalogue()`.
