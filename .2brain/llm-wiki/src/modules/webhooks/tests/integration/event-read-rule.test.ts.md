---
source: src/modules/webhooks/tests/integration/event-read-rule.test.ts
sha256: 9a10ec3f33fd81dfb490808b3c8d0f65ddee699ec63557e85bf50819998316dc
generated_at: 2026-11-14T22:50:02.253778+00:00
model: ollama:qwen3.8:27b
---

# src/modules/webhooks/tests/integration/event-read-rule.test.ts

## Purpose

Integration test that enforces the **event-read rule**: a caller may not create, mutate, replay, or process a webhook subscription/delivery for an event type their role cannot read. It exercises every mutation surface (create, update, secret rotation, replay, job processing) to confirm the `WEBHOOK_EVENT_READ_REQUIRED` refusal fires and that no partial state is written.

## Key elements

- **`asManager` / `asAdmin`** – Fixed caller fixtures. Manager reads `orders` but not `accounts` (i.e. `user.*` events); admin reads both.
- **`adminSubscription(eventTypes)`** – Creates a subscription as admin and returns the stored row; throws if the service call fails.
- **`codeOf(result)`** – Extracts `errors[0].code` from a failed service result, or returns `undefined` on success.
- **`deliveryOf(subscription, eventType)`** – Inserts a pending delivery row directly via `webhookDeliveryRepository.create`, bypassing the service layer.
- **`describe('create')`** – Manager is refused 403 for `user.updated` and `*`; succeeds for `order.paid`. Admin succeeds for `*`.
- **`describe('update')`** – Manager cannot change the URL or narrow-then-redirect an admin's stream; a description-only PATCH is allowed.
- **`describe('createSecret')`** – Manager is refused secret rotation; `list` exposes `actions.createSecret: false` for the manager but `true` for admin.
- **`describe('a delivery')`** – Manager cannot replay a delivery of an event they can't read; `processDeliveryJob` marks a delivery `exhausted` with "Event no longer matches the subscription filter" when the subscription no longer names the event.

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/webhooks/services/subscriptions.ts` | Calls `create`, `update`, `createSecret`, `list` — the SUTs under test. |
| `src/modules/webhooks/services/deliveries.ts` | Calls `replay` to verify authorization on the replay path. |
| `src/modules/webhooks/services/attempt.ts` | Calls `processDeliveryJob` to verify the delivery-abandonment guard. |
| `src/modules/webhooks/services/catalog.ts` | Calls `registerWebhookCatalog` in `beforeAll`/`afterAll` to seed and tear down the event-type registry. |
| `src/modules/webhooks/repository.ts` | Imports `webhookSubscriptionRepository` and `webhookDeliveryRepository` to assert no side-effect was written and to seed delivery rows directly. |
| `tests/support/callers.ts` | Provides `callerAs` to build the manager/admin caller objects. |
| `tests/support/setup-test-db.ts` | Called once at module top to provision the test database. |

## Notes

- The catalog is hard-coded to `['orders', 'users', 'example']`. Any change to the event-type taxonomy in production must be mirrored here or the `*` wildcard assertions will shift.
- The "narrow-then-redirect" test (`update` with both `eventTypes` and `url` in one call) guards against a two-step bypass where a caller narrows the stream to an event they *can* read, then pivots the URL. Both mutations are rejected atomically.
- `deliveryOf` writes directly to the repository, so it tests the *processing* path's guard, not the delivery-creation path's guard (which is covered by the create/update tests).
- The `analyticsConsent: false` field is present on every caller object; omitting it would cause a type error but is not under test here.
