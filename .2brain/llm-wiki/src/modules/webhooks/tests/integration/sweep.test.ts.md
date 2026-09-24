---
source: src/modules/webhooks/tests/integration/sweep.test.ts
sha256: 819b173bf19eefbfd4ce43c95a0bf5cc10edf2602831280ef9a3b7a8929fa118
generated_at: 2026-09-23T19:44:37.404088+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/tests/integration/sweep.test.ts

## Purpose

Integration test for `sweepDueWebhookDeliveries` run against a real database, with the queue adapter mocked. It verifies exactly what the sweep enqueues and which rows it skips — a code path that `delivery.test.ts` never exercises (that suite calls `processDeliveryJob` directly, bypassing the sweep-to-queue handoff).

## Key elements

- **`publishToQueueMock`** — `jest.fn()` that replaces `@infrastructure/adapters/queue`'s `publishToQueue`. Cleared in `beforeEach`; every assertion checks its call count and argument shape.
- **`createSubscription()`** — helper that mints a ring secret via `mintRingSecret()`, persists a real `WebhookSubscriptionDocument` through the repository, and returns it. Used by every test to give deliveries a valid `subscriptionId`.
- **"publishes a due pending row, without claiming it"** — seeds a `pending` delivery with a past `nextAttemptAt`, runs the sweep, asserts one queue publish on `WORKER_CHANNELS.WEBHOOK_DELIVER` carrying only `{ deliveryId }`, and confirms the row's status is still `pending` (the sweep does not claim).
- **"republishes a stranded in-flight row whose lease already expired"** — seeds an `in-flight` row with a past `leaseExpiresAt`; asserts the sweep re-enqueues it.
- **"ignores a row still under a live lease"** — seeds an `in-flight` row with a future `leaseExpiresAt`; asserts no queue call.
- **"ignores a pending row not due yet"** — seeds a `pending` row with a future `nextAttemptAt`; asserts no queue call.

## Relationships

- **`src/modules/webhooks/services/sweep.ts`** — the unit under test; the file imports and calls `sweepDueWebhookDeliveries()`.
- **`src/modules/webhooks/repository.ts`** — provides `webhookSubscriptionRepository` and `webhookDeliveryRepository` for seeding and post-assertion queries.
- **`src/modules/webhooks/secrets.ts`** — `mintRingSecret()` generates a valid ring-secret entry so the subscription document is well-formed.
- **`src/modules/webhooks/model.ts`** — supplies the `WebhookSubscriptionDocument` type used by the `createSubscription` helper's return annotation.
- **`src/types/index.ts`** — exports `WORKER_CHANNELS.WEBHOOK_DELIVER`, the queue name asserted in the publish call.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` provisions a real database connection for the test run.
- **`tests/support/callers.ts`** — provides `TEST_TENANT_ID`, a constant tenant identifier used in every repository write.

## Notes

- The sweep intentionally does **not** claim rows (no `in-flight` transition). The file's docblock and inline comments flag this as deliberate: a duplicate publish is safe without a claim, and the Claim Check (EIP) pattern means the message carries only the row id, not the payload.
- The queue adapter is the *only* mock in this file; all database access is real. This is what distinguishes it from a pure unit test of the sweep.
- `jest.mock('@infrastructure/adapters/queue', …)` is placed at module level, so the mock is active for every test in the file.
