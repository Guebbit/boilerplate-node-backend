---
source: src/modules/webhooks/tests/integration/fan-out.test.ts
sha256: 02c1c8403d6baedef33c2282d92ca4908aad89cb40e1dc7f5dcf9f4246b068f2
generated_at: 2026-11-08T09:08:46.561394+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/tests/integration/fan-out.test.ts

## Purpose

Integration test that verifies the webhook fan-out contract: a single public event produces delivery rows **only** for subscriptions that are both ENABLED and MATCHING the event type, and all rows for one event share the same `eventId` (the dedup key consumers rely on). It exists to guard against leaking data to disabled subscribers and to ensure consistent event identity across recipients.

## Key elements

- **`subscribe(eventTypes, enabled)`** – Helper that persists a real subscription via `webhookSubscriptionRepository.create`. When `enabled` is `false` it sets `disabledAt: new Date()` to model a "cut off" subscriber.
- **`announceSetup()`** – Wires the `user.setup_requested` domain-event → public-event mapping through `subscribeToWebhookEvents`, then emits the domain event for `user_1`.
- **`describe('webhook fan-out')`** – Two specs:
  - *Delivers only to the enabled, matching subscription* – Creates one matching+enabled, one matching+disabled, and one non-matching+enabled subscription; asserts exactly one delivery row for the matching one.
  - *Same `eventId` for one event* – Creates two matching subscriptions (one explicit type, one `*` wildcard); asserts two rows share a single `eventId`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `@tests/setup-test-db` | `setupTestDb()` initialises an in-memory DB before any test runs. |
| `@kernel/events` | `emitDomainEvent` triggers the fan-out; `resetDomainEvents` in `afterEach` clears the event bus between tests. |
| `@modules/webhooks/services/publish` | `subscribeToWebhookEvents` registers the event-type → public-event mapping that drives fan-out. |
| `@modules/webhooks/repository` | `webhookSubscriptionRepository.create` writes test fixtures; `webhookDeliveryRepository.findDue(10)` reads the resulting delivery rows for assertions. |
| `@modules/webhooks/secrets` | `mintRingSecret().entry` supplies a valid HMAC secret so the subscription is well-formed. |
| `@tests/callers` | `TEST_TENANT_ID` provides the tenant identifier for the test fixtures. |

The test also mocks `@infrastructure/adapters/queue` (`publishToQueue` → `true`) so no real queue messages are enqueued during assertions.

## Notes

- Disabling is modelled via the `disabledAt` timestamp, not a boolean flag — the repository's query logic filters on that field.
- The `*` wildcard event type is used in the second test to confirm it matches any event and still receives the same `eventId`.
- Assertions read through `findDue`, the same code path the delivery worker uses, so the test exercises the real read query rather than a test-only accessor.
