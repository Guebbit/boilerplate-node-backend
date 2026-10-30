---
source: src/modules/webhooks/tests/integration/fan-out.test.ts
sha256: be5f7de96b87083f452e64f723524ec2ff7f20ab3cd2268e1fb62276a48949f2
generated_at: 2026-10-29T06:32:04.237809+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/tests/integration/fan-out.test.ts

## Purpose

Integration test verifying the webhook fan-out contract: when a single public event is emitted, a delivery row is created **only** for subscriptions that are both enabled and filter-matching, and all rows produced by one event share the same `eventId` (the dedup key consumers rely on).

## Key elements

- **`subscribe(eventTypes, enabled)`** – helper that persists a real subscription via `webhookSubscriptionRepository.create`, toggling enabled state through the `disabledAt` timestamp field.
- **`announceSetup()`** – wires the fan-out handler for `user.setup-requested` (mapping an internal `userId` to a public payload) via `subscribeToWebhookEvents`, then emits the domain event.
- **`jest.mock('@infrastructure/adapters/queue', …)`** – no-ops `publishToQueue` so tests assert on delivery rows rather than queue side-effects.
- **`setupTestDb()`** – called at module scope; provisions a real (ephemeral) database for the suite.
- **`afterEach(resetDomainEvents)`** – clears any in-process event subscriptions between tests.
- **Test 1 – "delivers only to the enabled subscription whose filter matches"** – seeds three subscriptions (matching+enabled, matching+disabled, non-matching+enabled) and asserts exactly one delivery row is created.
- **Test 2 – "gives every subscription the same eventId for one event"** – seeds two enabled subscriptions (specific type + `*` wildcard) and asserts both rows exist with a single distinct `eventId`.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/kernel/events.ts` | Consumes `emitDomainEvent` (to trigger fan-out) and `resetDomainEvents` (teardown). |
| `src/modules/webhooks/services/publish.ts` | Calls `subscribeToWebhookEvents` to register the event→public-event mapping that drives fan-out. |
| `src/modules/webhooks/repository.ts` | Reads/writes through `webhookSubscriptionRepository` (create) and `webhookDeliveryRepository` (`findDue`) to assert on persisted rows. |
| `src/modules/webhooks/secrets.ts` | Uses `mintRingSecret` to generate a valid secret entry for each subscription fixture. |
| `tests/support/callers.ts` | Imports `TEST_TENANT_ID` to scope all fixtures to a single tenant. |
| `tests/support/setup-test-db.ts` | Calls `setupTestDb` at module load to stand up the test database. |

## Notes

- "Disabled" is modeled as the presence of a `disabledAt` timestamp, not a boolean flag — the `subscribe` helper encodes this by conditionally spreading `disabledAt`.
- `webhookDeliveryRepository.findDue(10)` is the read path used for assertions; the name implies a due-for-delivery query, not a full table scan.
- The `*` wildcard in Test 2 is part of the matching contract exercised here; it is not defined in this file.
- The queue mock returns `Promise.resolve(true)` — any test that *does* need real queue interaction must un-mock or use a different adapter.
