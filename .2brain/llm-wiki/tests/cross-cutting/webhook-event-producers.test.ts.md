---
source: tests/cross-cutting/webhook-event-producers.test.ts
sha256: 50f7a13b598cc1dd9e113b6c036dcd951e4afa9cd3e9d4134fd16db34fc4b1a7
generated_at: 2026-09-23T20:01:10.085645+00:00
model: ollama:qwen3.8:27b
---

# tests/cross-cutting/webhook-event-producers.test.ts

## Purpose

Proves, by execution rather than source-text inspection, that the webhook event catalogue (`asyncapi.yaml`) and the actual event producers are in exact lockstep: every declared channel has a real producer, and no producer emits a channel the catalogue does not declare. A second assertion pins the v1 event set to exactly six names, preventing silent additions or removals.

## Key elements

- **`declaredCatalogue()`** — Reads and YAML-parses `src/modules/webhooks/asyncapi.yaml` at runtime; returns the list of channel names (the public event-type catalogue).
- **`createCatchAllSubscription()`** — Seeds a `webhookSubscriptionRepository` row with `eventTypes: ['*']` and a fresh ring secret, so any fan-out from the producer is captured in a delivery row.
- **Test: "the six declared events are produced, and nothing else is"** — Emits five domain events (`ORDER_CREATED`, `ORDER_STATUS_CHANGED` ×2, `ORDER_CANCELLED`, `PAYMENT_SUCCEEDED`, `PAYMENT_FAILED`), reads back all delivery rows, and asserts the set of `eventType` values equals the catalogue set.
- **Test: "the catalogue names exactly the six events…"** — Asserts the catalogue (via `declaredCatalogue()`) equals a hardcoded array of the six v1 event names.

## Relationships

- **`src/kernel/events.ts`** — Supplies `emitDomainEvent()` (to trigger producers) and `resetDomainEvents()` (to clean up between tests).
- **`src/kernel/registry.ts`** — `registerModules([webhooksModule])` wires `subscribeToWebhookEvents` so domain events are fanned out to webhook deliveries.
- **`src/modules/orders/index.ts`** — Exports the `ORDER_CREATED`, `ORDER_STATUS_CHANGED`, `ORDER_CANCELLED` event-name constants used as emit targets.
- **`src/modules/payments/index.ts`** — Exports `PAYMENT_SUCCEEDED`, `PAYMENT_FAILED` event-name constants.
- **`src/modules/webhooks/module.ts`** — The module registered in `beforeEach`; its subscriber is what translates domain events into delivery rows.
- **`src/modules/webhooks/repository.ts`** — `webhookSubscriptionRepository.create()` (catch-all subscription) and `webhookDeliveryRepository.findAll()` (read-back of produced event types).
- **`src/modules/webhooks/secrets.ts`** — `mintRingSecret()` generates the secret entry required by the subscription.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` provisions the in-memory database used for the repository calls.

## Notes

- **Five emits → six events.** `ORDER_STATUS_CHANGED` fans out to both `order.paid` and `order.shipped` depending on the `to` payload field, so only five distinct domain-event emissions are needed to cover all six public event types.
- **Catalogue is read from disk at test time.** The test loads `asyncapi.yaml` via `readFileSync` relative to `__dirname`. Renaming a channel in the YAML without updating the producer (or vice-versa) will cause a set-mismatch failure — no import of the YAML at compile time is involved.
- **Ratchet assertion.** The second test hardcodes the six v1 event names. This is intentional: it forces a conscious test edit if anyone adds or removes an event, rather than silently expanding the contract.
- Uses `toSorted()` (non-mutating, ES 2023) for set-comparison ordering rather than `.sort()`.
