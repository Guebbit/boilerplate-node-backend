---
source: src/modules/webhooks/tests/integration/sweep.test.ts
sha256: 4a050de768ae2d7d80e78fb5200038c91ebf5292fb688592ff4a65854973ff10
generated_at: 2026-10-29T06:33:02.375263+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/tests/integration/sweep.test.ts

## Purpose

Integration test for `sweepDueWebhookDeliveries` against a real database, with the queue publisher and the HTTP delivery transport mocked. It exercises the one path `delivery.test.ts` never reaches: delivery jobs enqueued (or sent inline) *through* the sweep rather than invoked directly.

## Key elements

- **`publishToQueueMock` / `deliverWebhookMock`** — jest mocks for `@infrastructure/adapters/queue` and `@modules/webhooks/transport/webhook-delivery`. Cleared/reset in every `beforeEach`.
- **`createSubscription()`** — helper that mints a ring secret and persists a subscription document via `webhookSubscriptionRepository`.
- **`createDue(subscription, eventId)`** — helper that persists a pending, already-due delivery row.
- **Top-level `it` blocks** — verify that a due pending row is published (not claimed), a stranded expired-lease row is republished, a live-lease row is skipped, and a not-yet-due row is skipped.
- **`describe('with no broker to take the message')`** — sets `publishToQueueMock` to resolve `false`, forcing the sweep's inline-delivery fallback. Covers: inline send + outcome recording, batch (7 rows) delivery, live-lease skip, and per-row error isolation (one throw does not abort the sweep).

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/webhooks/services/sweep.ts` | Module under test — calls `sweepDueWebhookDeliveries()`. |
| `src/modules/webhooks/repository.ts` | Creates fixture rows (`webhookSubscriptionRepository.create`, `webhookDeliveryRepository.create`) and reads them back (`findById`) to assert state. |
| `src/modules/webhooks/secrets.ts` | `mintRingSecret()` supplies a valid ring-secret entry for the subscription fixture. |
| `src/modules/webhooks/model.ts` | `WebhookSubscriptionDocument` type used in helper signatures. |
| `src/types/index.ts` | `WORKER_CHANNELS.WEBHOOK_DELIVER` asserted as the queue channel in publish calls. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` bootstraps the real database before the suite runs. |
| `tests/support/callers.ts` | `TEST_TENANT_ID` used as the tenant field in every fixture. |

## Notes

- The sweep intentionally does **not** set a row to `in-flight`; it only publishes. The test asserts the DB row remains `pending` after a successful publish. The file's header and the `sweep.ts` docblock both note that a duplicate publish is safe without a claim step (see `asyncapi.internal.yaml` "Claim Check (EIP)").
- In the "no broker" block, `deliverWebhookMock` doubles as the outcome recorder: after an inline send the test reads the row back and expects `status: 'succeeded'`.
- The `mockRejectedValueOnce` case confirms the sweep catches per-row errors internally and continues to the next row, resolving without throwing.
- The publish payload is asserted as exactly `{ deliveryId: String(id) }` — no lease token, no attempt count.
