---
source: src/modules/webhooks/tests/integration/delivery-log.test.ts
sha256: f57b234637d7ffff113634e00c20b8857756c417c5c6de1731b06f2b1f7fc74a
generated_at: 2026-11-08T09:08:19.495537+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/tests/integration/delivery-log.test.ts

## Purpose

Integration tests (run against a real database) that verify the webhook delivery log's `list` and `replay` service functions. They confirm tenant isolation on reads, filtering by subscription and status, and that a replay with nothing to re-send returns 404 without mutating the delivery row.

## Key elements

- **`context`** — A tenant caller context (manager role, no analytics consent) passed to `list`/`replay`.
- **`subscriptionIn(tenant)`** — Helper that creates a webhook subscription in the given tenant via `webhookSubscriptionRepository`.
- **`deliveryFor(subscriptionId, tenant, status?, eventId?)`** — Helper that creates a delivery row; defaults to `status: 'pending'` and a random `eventId`.
- **`describe('listing the delivery log')`** — Two tests on `list`: tenant-scoped visibility, and narrowing by `subscriptionId` + `status`.
- **`describe('a replay with nothing to re-send')`** — Three tests on `replay`: unknown ID → 404, cross-tenant ID → 404, and deleted subscription → 404 with the delivery row left unclaimed.

## Relationships

- **`src/modules/webhooks/services/deliveries.ts`** — Under test; imports `list` and `replay`.
- **`src/modules/webhooks/repository.ts`** — Imports `webhookDeliveryRepository` and `webhookSubscriptionRepository` for seed data and post-condition assertions.
- **`src/modules/webhooks/secrets.ts`** — Imports `mintRingSecret` to populate subscription secrets.
- **`src/modules/webhooks/model.ts`** — Imports the `WebhookSubscriptionDocument` type for the `subscriptionId` parameter.
- **`tests/support/setup-test-db.ts`** — Calls `setupTestDb()` at module load to provision a real database for the suite.
- **`tests/support/callers.ts`** — Imports `callerAs` and `TEST_TENANT_ID` to construct the caller context.

## Notes

- `setupTestDb()` runs at module scope (not in a `beforeAll`), so the DB is ready before any test executes.
- The "subscription is gone" test asserts the delivery's `status` is unchanged after a failed replay — a guard against partial side-effects.
- Filtering assertions use `.toSorted()` because the service does not guarantee insertion order in the response.
