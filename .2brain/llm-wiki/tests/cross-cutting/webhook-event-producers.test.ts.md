---
source: tests/cross-cutting/webhook-event-producers.test.ts
sha256: 932531040006121127d0b68aad86db8266c1b8696b0514e3ca01dab1c4fdf2de
generated_at: 2026-10-15T12:42:02.557150+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/webhook-event-producers.test.ts

## Purpose

Proves, end-to-end via the domain-event bus, that the set of public webhook events actually produced by registered modules exactly matches the set declared in their `asyncapi.webhooks.yaml` fragments. It verifies both directions in one assertion: every declared event has a producer, and no producer fires an undeclared event. It exercises the real `registry` indirection so `webhooks/module.ts`'s `onRegistered` hook resolves domain-event → public-event mappings the same way it would in production.

## Key elements

- **`REGISTERED_OWNERS`** – const tuple (`['orders','payments','returns','example']`) identifying which modules' YAML fragments define the expected catalogue.
- **`declaredCatalogue()`** – delegates to `declaredWebhookEvents(REGISTERED_OWNERS)` to produce the expected event-name list.
- **`createCatchAllSubscription()`** – inserts a subscription row with `eventTypes: ['*']` and a minted ring secret so any fan-out delivery is captured.
- **`describe › "every declared event is produced, and nothing else is"`** – the main suite; `beforeEach` registers all five modules (four producers + `webhooksModule`), `afterEach` calls `resetDomainEvents()`.
- **`it("every declared event is produced, and nothing else is")`** – emits every domain event (order, payment, return, example) with synthetic payloads, reads back `webhookDeliveryRepository.findAll`, and asserts the produced `eventType` set equals `declaredCatalogue()` (sorted).
- **`it("GET /webhooks/events lists exactly what the registered modules declare")`** – calls `listWebhookEventCatalogue()` and asserts its names equal `declaredCatalogue()`.

## Relationships

- **`src/kernel/events.ts`** – source of `emitDomainEvent` / `resetDomainEvents`; the test drives all fan-out through this bus rather than HTTP.
- **`src/kernel/registry.ts`** – `registerModules` wires the real registration order so `webhooksModule`'s `onRegistered` hook can resolve each producer's `publicEvents`.
- **`src/modules/orders/*`** – exports `ORDER_CREATED`, `ORDER_STATUS_CHANGED`, `ORDER_CANCELLED` and the module object that declares its `publicEvents`.
- **`src/modules/payments/*`** – exports `PAYMENT_SUCCEEDED`, `PAYMENT_FAILED`, `PAYMENT_REFUNDED` and its module.
- **`src/modules/returns/*`** – exports `RETURN_REQUESTED`, `RETURN_RECEIVED`, `RETURN_CLOSED` and its module.
- **`src/modules/example/*`** – exports `EXAMPLE_PUBLISHED` and its module (a minimal single-event producer).
- **`src/modules/webhooks/module.ts`** – the subscriber whose `onRegistered` hook subscribes to domain events and maps them to public events.
- **`src/modules/webhooks/repository.ts`** – `webhookSubscriptionRepository` and `webhookDeliveryRepository` used to seed the subscription and read back produced deliveries.
- **`src/modules/webhooks/secrets.ts`** – `mintRingSecret` generates the secret entry for the catch-all subscription.
- **`src/modules/webhooks/services/index.ts` / `catalogue.ts`** – `listWebhookEventCatalogue` returns the runtime catalogue the second test asserts against.

## Notes

- `ORDER_STATUS_CHANGED` is emitted **twice** (→ `paid`, → `shipped`) because two distinct public events derive from the same domain event with different `to` values.
- Registering `webhooksModule` alone would cause its `onRegistered` lookup to find no producer declarations and produce nothing; all four producer modules **must** be registered first.
- The test uses the real Mongo-backed test DB (`setupTestDb`), not an in-memory mock, so `webhookDeliveryRepository.findAll` hits a real collection.
- `ORDER_ID` and `PAYMENT_ID` are distinct 24-hex-char strings so the payments module's internal lookup of an order by id does not collide with the order's own id.
