---
source: src/modules/orders/services/announce.ts
source_sha256: 34380f86c12626ad367871f82328bab69cebe8ddf0c4b639349600c8e7b9965a
context_sha256: de4002d70cecc75acabba8cc3eee2838a23cb9e2316fac9f9a69c874b8f0a1ba
generated_at: 2026-11-22T06:18:37.027346+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/services/announce.ts

## Purpose
Builds the order events that ride the transactional outbox. Each status write passes one of these announcements to `announceInTransaction`, so the event row commits together with the write or not at all. The file only constructs `OutboxAnnouncement` objects. It does no I/O itself.

## Key elements
- `statusChangedEvent(orderId, from, to)` builds the `ORDER_STATUS_CHANGED` announcement with payload `{ orderId, from, to }`.
- `createdEvent(orderId)` builds the `ORDER_CREATED` announcement with payload `{ orderId }`.
- `statusOverriddenEvent(orderId, from, to, at)` builds the `ORDER_STATUS_OVERRIDDEN` announcement. Its payload is `{ orderId, from, to, at, mode: 'status' }`, with `at` serialised via `toISOString()`. It is written beside the matching `order.status_changed` so `delivery` can bring its shipments in step at the override's own instant.
- `billingCorrectedEvent(orderId)` builds the `ORDER_BILLING_CORRECTED` announcement with payload `{ orderId }`.

## Relationships
- **`src/kernel/outbox.ts`**: provides the `OutboxAnnouncement` type that every builder returns.
- **`src/modules/orders/events.ts`**: provides the event name constants (`ORDER_CREATED`, `ORDER_STATUS_CHANGED`, `ORDER_STATUS_OVERRIDDEN`, `ORDER_BILLING_CORRECTED`). Each builder uses one as the announcement `name` and as its type parameter.
- **`src/types/index.ts`**: provides the `OrderStatus` type for the `from` and `to` parameters.
- **`billing.ts`, `override.ts`, `place.ts`, `status.ts`** (sibling services): these are graph neighbors, so they presumably call these builders. The file itself shows no import or call from them, so check those files to confirm which builder each one uses.

## Notes
- Every event sets `aggregateId` to the order id. Per-order ordering therefore holds across `created`, `status_changed` and `canceled`.
- The doc comment on `statusChangedEvent` mentions a `canceled` event, but this file defines no builder for it.
- `statusOverriddenEvent` hardcodes `mode: 'status'` in its payload.
