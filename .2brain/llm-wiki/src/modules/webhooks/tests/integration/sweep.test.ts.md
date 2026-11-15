---
source: src/modules/webhooks/tests/integration/sweep.test.ts
sha256: d8650e50a53b35a278385a2da103c68730e2f953d3529c5654a03dd1f3b9e04a
generated_at: 2026-11-14T22:51:34.951233+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/tests/integration/sweep.test.ts

## Purpose

Integration test for the retry sweep (`sweepDueWebhookDeliveries`) run against a real database with the queue broker and HTTP delivery mocked. It closes the gap left by `delivery.test.ts`, which always invokes `processDeliveryJob` directly and never exercises the sweep's enqueue path. Covers: what the sweep enqueues, lease-expiry republish, the overdue gauge, and the inline-delivery fallback when the broker is unavailable.

## Key elements

- **`createSubscription`** – helper that persists a real `WebhookSubscriptionDocument` (one ring secret via `mintRingSecret`) to the test DB.
- **`createDue`** – helper that persists a pending delivery row already past its `nextAttemptAt`.
- **`overdueNow`** – helper that scrapes the `webhook_deliveries_overdue` gauge through `metricsRegistry` and returns the first metric value.
- **Queue-publish tests** – verify the sweep calls `publishToQueue` exactly once with `{ queue: WORKER_CHANNELS.WEBHOOK_DELIVER, payload: { deliveryId } }`, leaves the row `pending` (no claim), republishes expired-lease rows, and skips live-lease or not-yet-due rows.
- **Overdue-gauge tests** – confirm a row 5 min late does not increment the gauge but an 11-min-late row does (the 10-minute alert threshold).
- **No-broker fallback tests** (`publishToQueue` resolves `false`) – the sweep delivers inline via `deliverWebhook`, records the outcome, handles multiple rows, respects live leases, and isolates a single send failure without aborting the batch.

## Relationships

- **`src/modules/webhooks/services/sweep.ts`** – system under test; `sweepDueWebhookDeliveries` is the sole entry point called in every test.
- **`src/modules/webhooks/repository.ts`** – `webhookSubscriptionRepository` / `webhookDeliveryRepository` create and read the real fixtures the assertions depend on.
- **`src/modules/webhooks/secrets.ts`** – `mintRingSecret` produces a valid entry for the subscription's `secrets` array.
- **`src/modules/webhooks/model.ts`** – provides the `WebhookSubscriptionDocument` type used in helper signatures.
- **`src/modules/webhooks/metrics.ts`** – imported for its side effect (registers the overdue gauge with the registry at module load, mirroring boot).
- **`src/infrastructure/observability/metrics-registry.ts`** – `metricsRegistry` is queried directly to assert gauge values.
- **`src/types/index.ts`** – source of the `WORKER_CHANNELS.WEBHOOK_DELIVER` constant used in publish-payload assertions.
- **`tests/support/setup-test-db.ts`** – `setupTestDb` initialises the real database connection for the suite.
- **`tests/support/callers.ts`** – `TEST_TENANT_ID` is the tenant stamped on every fixture row.

## Notes

- The sweep is intentionally **unclaiming**: it never flips a row to `in_flight` before publishing. The file's comment cites `sweep.ts`'s docblock explaining that a duplicate publish is safe, so the row stays `pending` after the call.
- The `metrics` import is purely a side-effect import; without it the gauge would be unregistered and the scrape test would fail.
- The "no broker" section mocks `publishToQueue` to resolve `false`, which is the sweep's signal to fall back to inline `deliverWebhook`. This is the only path where `deliverWebhookMock` is expected to fire.
- A single failing send (mocked via `mockRejectedValueOnce`) must not prevent subsequent sends in the same sweep run.
