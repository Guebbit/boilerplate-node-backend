---
source: src/modules/webhooks/tests/integration/sweep.test.ts
sha256: b5cb047b06e8b296d7cb253048e6adf85610ae079b6427c29d200312791b10b3
generated_at: 2026-10-15T12:24:36.300242+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/tests/integration/sweep.test.ts

## Purpose

Integration test for `sweepDueWebhookDeliveries` run against a **real database** with the queue publisher and the HTTP transport mocked. It verifies the sweep's selection criteria (which rows it picks up) and its two delivery paths: publishing to the worker queue, and falling back to inline delivery when the broker is unavailable. It covers the code path that `delivery.test.ts` never reaches, since that suite calls `processDeliveryJob` directly against a fixture.

## Key elements

- **`publishToQueueMock`** — jest mock replacing `@infrastructure/adapters/queue`; its resolved value (`true` / `false`) selects the queue-publish path vs. the inline-delivery fallback.
- **`deliverWebhookMock`** — jest mock replacing `deliverWebhook` from the transport layer; captures inline-delivery calls and lets tests simulate send failures.
- **`createSubscription()`** — helper that writes a real `WebhookSubscriptionDocument` (one ring secret, `enabled: true`) via `webhookSubscriptionRepository.create`.
- **`createDue(subscription, eventId)`** — helper that writes a real pending delivery row with `nextAttemptAt` in the past.
- **Queue-path tests** (top-level `it` blocks) — assert the sweep publishes exactly one message to `WORKER_CHANNELS.WEBHOOK_DELIVER` with a `{ deliveryId }` payload, and that the row's status stays `pending` (no claim).
- **`describe('with no broker to take the message')`** — sets `publishToQueue` to resolve `false`, then verifies the sweep calls `deliverWebhook` inline, records the outcome (`succeeded`), handles multiple rows, skips live-leased rows, and survives a per-row send error.

## Relationships

- **`src/modules/webhooks/services/sweep.ts`** — the unit under test; `sweepDueWebhookDeliveries` is the only exported function called.
- **`src/modules/webhooks/repository.ts`** — `webhookSubscriptionRepository` and `webhookDeliveryRepository` are used to seed rows and to read back state for assertions.
- **`src/modules/webhooks/secrets.ts`** — `mintRingSecret` produces the secret entry attached to each test subscription.
- **`src/modules/webhooks/model.ts`** — provides the `WebhookSubscriptionDocument` type used in helper signatures.
- **`src/types/index.ts`** — supplies `WORKER_CHANNELS.WEBHOOK_DELIVER` for the queue-name assertion.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` provisions a real database connection for the suite.
- **`tests/support/callers.ts`** — `TEST_TENANT_ID` is the fixed tenant identifier used in every row.

## Notes

- The sweep intentionally does **not** claim rows (no `in-flight` transition). The test explicitly asserts the status remains `pending` after a successful publish; the design relies on the worker-side lease for deduplication.
- The "no broker" fallback is triggered purely by `publishToQueue` resolving `false`; there is no separate error-branch — a rejected promise would also fall through.
- Inline delivery records the outcome on the row (e.g. `succeeded`), whereas the queue path leaves the row untouched.
- A single row whose inline send throws does **not** abort the sweep; the test confirms the second row is still delivered.
