---
source: tests/cross-cutting/webhook-event-producers.test.ts
sha256: 33db278f27193a78f8030cd5e554ed5c31c2a7a625728eb9f6eb5cdd0a451cd3
generated_at: 2026-09-27T15:53:19.969718+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/webhook-event-producers.test.ts

## Purpose

Cross-cutting invariant test that proves, by actual execution rather than source inspection, that the set of public webhook events produced by the `orders`/`payments` modules (as wired through the real registry indirection in `webhooks/module.ts`) is exactly the set declared in `webhooks/asyncapi.yaml`—no more, no fewer.

## Key elements

- **`declaredCatalogue()`** – Reads `src/modules/webhooks/asyncapi.yaml` from disk, parses the YAML, and returns the array of channel names (i.e. the public event catalogue).
- **`createCatchAllSubscription()`** – Creates a `webhookSubscriptionRepository` row with `eventTypes: ['*']` so any fanned-out delivery is captured; uses `mintRingSecret()` for the secret entry.
- **`ORDER_ID` / `PAYMENT_ID`** – Fixed, syntactically-valid Mongo-hex IDs used in synthetic domain-event payloads; deliberately distinct so `payments`' `ORDER_CANCELLED` listener can look up the order without collision.
- **`beforeEach` / `afterEach`** – Registers all three modules via `registerModules`, then resets the domain-event bus after each test.
- **Test 1 – "the six declared events are produced, and nothing else is"** – Emits five domain events (`ORDER_CREATED`, `ORDER_STATUS_CHANGED` ×2, `ORDER_CANCELLED`, `PAYMENT_SUCCEEDED`, `PAYMENT_FAILED`), reads back all `webhookDeliveryRepository` rows, and asserts the produced `eventType` set equals `declaredCatalogue()`.
- **Test 2 – catalogue pin** – Asserts `declaredCatalogue()` matches the six hard-coded v1 event names, guarding against silent addition/removal in the YAML.

## Relationships

- **`src/kernel/events.ts`** – `emitDomainEvent` drives the bus; `resetDomainEvents` clears state between tests.
- **`src/kernel/registry.ts`** – `registerModules` is the single entry point that triggers `webhooks/module.ts`'s `onRegistered` hook, which in turn resolves `publicEvents` from the already-registered orders/payments modules.
- **`src/modules/orders/index.ts` / `module.ts`** – Exports the three order domain-event constants and the `ordersModule` registration object.
- **`src/modules/payments/index.ts` / `module.ts`** – Exports `PAYMENT_SUCCEEDED` / `PAYMENT_FAILED` and the `paymentsModule` registration object.
- **`src/modules/webhooks/module.ts`** – The module whose `onRegistered` hook performs the generic domain→public event fan-out; the test depends on this indirection rather than hardcoding mappings.
- **`src/modules/webhooks/repository.ts`** – `webhookSubscriptionRepository` (create) and `webhookDeliveryRepository` (findAll) are the only persistence calls.
- **`src/modules/webhooks/secrets.ts`** – `mintRingSecret` supplies a valid secret entry for the subscription.
- **`tests/support/setup-test-db.ts`** – `setupTestDb` initialises the in-memory database before any test runs.

## Notes

- `ORDER_STATUS_CHANGED` is a single domain event that maps to **two** public events (`order.paid`, `order.shipped`) depending on the `to` field in the payload—this is why five emits yield six public types.
- All three modules **must** be registered together; registering only `webhooksModule` leaves its `onRegistered` hook with an empty `publicEvents` lookup and zero deliveries.
- The test reads `asyncapi.yaml` at a path relative to the test file (`../../src/modules/webhooks/asyncapi.yaml`); moving the test directory will break the read.
- Comparisons use `.toSorted()` so order in the YAML or in delivery rows is irrelevant.
