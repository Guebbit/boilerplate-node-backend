---
source: tests/cross-cutting/webhook-event-producers.test.ts
sha256: e4dd4c18c3da045e365ffdf476e6979b44b9232f2f924ded3a2c7667d1e6cdab
generated_at: 2026-11-14T23:08:58.236383+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/webhook-event-producers.test.ts

## Purpose

Cross-cutting integration test that proves two invariants simultaneously: every public webhook event declared in the registered modules' `asyncapi.webhooks.yaml` fragments is actually produced when the corresponding domain events fire, **and** no delivery row ever names an event the catalogue does not declare. It does this end-to-end through the real registry and domain-event bus rather than by inspecting source text.

## Key elements

- **`REGISTERED_OWNERS`** – Tuple of module names (`orders`, `payments`, `returns`, `example`, `users`) whose asyncapi fragments define the expected event set.
- **`declaredCatalog()`** – Calls the shared `declaredWebhookEvents` helper with `REGISTERED_OWNERS` to get the full list of declared public event names.
- **`createCatchAllSubscription()`** – Mints a ring secret and inserts a subscription with `eventTypes: ['*']` so any fan-out lands in the delivery table.
- **Main test (`it('every declared event is produced…')`)** – Emits every domain event (orders, users, payments, returns, example), reads back all `webhookDeliveryRepository` rows, and asserts the sorted set of `eventType` values equals the sorted declared catalogue.
- **Catalogue-listing test** – Asserts `webhooksService.listWebhookEventCatalog` returns exactly the declared event names, confirming the service-side view matches.
- **`ORDER_ID` / `PAYMENT_ID`** – Distinct, syntactically-valid Mongo IDs used in synthetic payloads; `PAYMENT_ID` differs from `ORDER_ID` so a payment's `orderId` field is never confused with the order's own id.

## Relationships

- **`src/kernel/events.ts`** – Source of `emitDomainEvent` (the bus the test drives) and `resetDomainEvents` (teardown between tests).
- **`src/kernel/registry.ts`** – `registerModules` is the real registry indirection; the webhooks module's `onRegistered` hook reads other modules' `publicEvents` declarations through it.
- **`src/modules/orders/module.ts`**, **`src/modules/payments/module.ts`**, **`src/modules/returns/module.ts`**, **`src/modules/users/module.ts`**, **`src/modules/example/module.ts`** – Each module's `publicEvents` manifest is what `webhooks/module.ts` resolves and wires into the generic subscriber.
- **`src/modules/orders/index.ts`**, **`src/modules/payments/index.ts`**, **`src/modules/returns/index.ts`**, **`src/modules/users/index.ts`**, **`src/modules/example/index.ts`** – Export the domain-event name constants (`ORDER_CREATED`, `PAYMENT_SUCCEEDED`, `RETURN_REQUESTED`, `USER_ERASED`, `EXAMPLE_PUBLISHED`, etc.) used as emit arguments.
- **`src/modules/webhooks/module.ts`** – Its `onRegistered` hook performs the fan-out wiring; the test must register it *after* the other modules so the lookup is non-empty.
- **`src/modules/webhooks/repository.ts`** – `webhookSubscriptionRepository` (subscription creation) and `webhookDeliveryRepository` (reading back produced delivery rows).
- **`src/modules/webhooks/secrets.ts`** – `mintRingSecret` generates the secret entry stored on the test subscription.

## Notes

- The test must register **all** modules, not just `webhooksModule`. Registering the webhooks module alone causes its `onRegistered` hook to resolve an empty `publicEvents` lookup and wire no subscriber.
- `ORDER_STATUS_CHANGED` is emitted **twice** (`to: 'paid'` and `to: 'shipped'`) because two distinct public events (`order.paid`, `order.shipped`) both derive from that single domain event.
- `ORDER_ID` is a valid 24-hex-char Mongo ID because `payments`' `ORDER_CANCELED` handler performs a lookup by it; a malformed id would break that listener.
- The assertion is a **set equality** (sorted array comparison), not a per-event assertion, so adding a new domain event without a corresponding catalogue entry (or vice versa) fails immediately in either direction.
