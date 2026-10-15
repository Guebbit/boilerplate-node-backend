---
source: src/modules/webhooks/tests/integration/delivery-log.test.ts
sha256: f57b234637d7ffff113634e00c20b8857756c417c5c6de1731b06f2b1f7fc74a
generated_at: 2026-10-15T12:23:19.669979+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/tests/integration/delivery-log.test.ts

## Purpose

Integration tests (against a real database) for two read-path behaviors of the webhook delivery log: that `list` returns only the caller's tenant's deliveries and supports narrowing by subscription and status, and that `replay` returns a 404 without mutating the delivery row when there is nothing to re-send.

## Key elements

- **`setupTestDb()`** — called at module top level; provisions the real test database before any test runs.
- **`context`** — the shared caller object: `callerAs('manager')` with `analyticsConsent: false`. All tests act as a manager in `TEST_TENANT_ID`.
- **`subscriptionIn(tenant)`** — helper that creates a `WebhookSubscriptionDocument` via `webhookSubscriptionRepository.create`, with a fixed URL, `eventTypes: ['*']`, and a freshly minted ring secret.
- **`deliveryFor(subscriptionId, tenant, status?, eventId?)`** — helper that creates a delivery row via `webhookDeliveryRepository.create` with an `order.paid` event; defaults to `status: 'pending'` and a random `evt-*` id.
- **`describe('listing the delivery log')`** — two tests on `list`: tenant isolation and filtering by `subscriptionId` / `status`.
- **`describe('a replay with nothing to re-send')`** — three tests on `replay`: unknown id → 404; another tenant's delivery → 404; subscription already deleted → 404 with a specific error message and the delivery row left unmodified (`status` stays `'succeeded'`).

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/webhooks/services/deliveries.ts` | The unit under test: `list` and `replay` are the two service functions exercised here. |
| `src/modules/webhooks/repository.ts` | `webhookSubscriptionRepository` and `webhookDeliveryRepository` are used both to seed fixtures and to assert post-conditions (e.g. verifying the row was not mutated). |
| `src/modules/webhooks/model.ts` | `WebhookSubscriptionDocument` type is imported for the `_id` type in `deliveryFor`. |
| `src/modules/webhooks/secrets.ts` | `mintRingSecret()` generates the secret entry embedded in each test subscription. |
| `tests/support/callers.ts` | `callerAs` builds the authenticated caller; `TEST_TENANT_ID` is the "own" tenant used in isolation assertions. |
| `tests/support/setup-test-db.ts` | `setupTestDb` is invoked once at import time to create/reset the real test database. |

## Notes

- Tenant isolation is tested with the literal string `'another-tenant'` rather than a second named constant; only `TEST_TENANT_ID` comes from `callers.ts`.
- The "subscription gone" replay test explicitly asserts the delivery's `status` is **unchanged** (`'succeeded'`), documenting that a refused replay must not mutate the row.
- `eventId` defaults use `Math.random()`, so delivery documents are unique per run without extra bookkeeping.
- Ordering-sensitive assertions use `.toSorted()` rather than `sort()` to avoid mutating the source array.
