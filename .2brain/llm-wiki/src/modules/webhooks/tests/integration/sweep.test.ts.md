---
source: src/modules/webhooks/tests/integration/sweep.test.ts
sha256: 7e622d262c47d39903a9d729d9490be7a037a387564994ccd84c49bc161acc56
generated_at: 2026-11-08T09:09:43.489450+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/tests/integration/sweep.test.ts

## Purpose

Integration tests for `sweepDueWebhookDeliveries` run against a real database. The queue adapter and the direct-delivery transport are mocked so the tests verify exactly what the sweep enqueues (or falls back to sending directly) without a live broker or network. This covers the path that `delivery.test.ts` never exercises: rows reached *through* the sweep rather than by calling `processDeliveryJob` directly on a fixture.

## Key elements

- **`publishToQueueMock` / `deliverWebhookMock`** – Jest mocks injected via `jest.mock` of `@infrastructure/adapters/queue` and `@modules/webhooks/transport/webhook-delivery`. All assertions target these two functions.
- **`createSubscription()`** – Helper that persists a real `WebhookSubscriptionDocument` (with one ring secret from `mintRingSecret`) under `TEST_TENANT_ID`.
- **`createDue(subscription, eventId)`** – Helper that persists a pending delivery row whose `nextAttemptAt` is 1 s in the past, making it immediately due.
- **Top-level `it` blocks** – Verify the sweep's *enqueue* path: publishes exactly one message per due row, payload contains only `deliveryId`, row status is left as `pending` (no claim), and expired-lease `in_flight` rows are republished while live-lease and not-yet-due rows are ignored.
- **`describe('with no broker to take the message')`** – Stubs `publishToQueue` to resolve `false`, forcing the sweep's direct-delivery fallback. Confirms: one `deliverWebhook` call per due row, outcome persisted as `succeeded`, live-lease rows untouched, and a single throwing send does not abort the remaining sends.

## Relationships

- **`src/modules/webhooks/services/sweep.ts`** – The unit under test; `sweepDueWebhookDeliveries` is the sole function called under test.
- **`src/modules/webhooks/repository.ts`** – `webhookSubscriptionRepository` and `webhookDeliveryRepository` are used to create and read real rows.
- **`src/modules/webhooks/secrets.ts`** – `mintRingSecret` generates the secret entry stored with each subscription.
- **`src/modules/webhooks/model.ts`** – Supplies the `WebhookSubscriptionDocument` type used in helper signatures.
- **`src/types/index.ts`** – `WORKER_CHANNELS.WEBHOOK_DELIVER` provides the expected queue name in assertions.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` initialises the real (in-memory/test) database for the suite.
- **`tests/support/callers.ts`** – `TEST_TENANT_ID` is the fixed tenant id used in every row.

## Notes

- The sweep intentionally does **not** set a row to `in_flight` before publishing; the test asserts the stored status remains `pending`. The comment references `sweep.ts`'s docblock and the asyncapi spec's "Claim Check (EIP)" pattern — duplicate publishes are considered safe by design.
- The queue payload is `{ deliveryId: string }` only (no payload, no secret). If you change the message schema, update the assertion in the first `it`.
- The "no broker" fallback path calls `deliverWebhook` directly and persists the result (`succeeded`/`failed`) back to the delivery row — this is the only place in the test file that checks post-sweep DB state for status changes other than "still pending."
- `setupTestDb()` is called once at module level (outside `beforeEach`); the per-test reset only clears the two mocks.
