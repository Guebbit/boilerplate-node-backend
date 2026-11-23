---
source: src/modules/shop-tasks/services/delayed.ts
source_sha256: 3dc22d13c4463e1070fe41546800b10b085c6630f4a1a6338e149c6dafb40a2f
context_sha256: 116b8b7c7058305f35d7d89759daa9d11ca3eb73ee0c42f843c9ea20401c51d8
generated_at: 2026-11-22T07:42:39.268920+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/shop-tasks/services/delayed.ts

## Purpose
Handles the `fulfillment_order.delayed` domain event for the shop-tasks module. That event is both a to-do (the buyer may owe consent) and a message to the buyer. A module holds only one handler per event, so this file combines the two: it runs the task handler first, then the notice handler.

## Key elements
- `onFulfillmentOrderDelayed(payload, meta)` is the exported handler. It calls `shopTasks.onDelayed(payload, meta)`, then `shopNotices.onFulfillmentOrderDelayedNotice(payload)`, and returns a `Promise<void>`.
  - `payload` is typed as `DomainEventMap['fulfillment_order.delayed']`.
  - `meta` is typed as `DomainEventMeta`.

## Relationships
- `src/kernel/events.ts` provides the `DomainEventMap` and `DomainEventMeta` types, which are used for typing only.
- `src/modules/shop-tasks/services/tasks.ts` provides `shopTasks`. Its `onDelayed` opens the consent reminder when one is owed.
- `src/modules/shop-tasks/services/notices.ts` provides `shopNotices`. Its `onFulfillmentOrderDelayedNotice` writes the buyer's notice.
- `src/modules/shop-tasks/services/index.ts` is a neighbor in the dependency graph. Nothing in this file shows how the two are connected.

## Notes
- Order matters. The to-do runs first, and the notice runs only if it resolves. A failure in the to-do means no notice is written.
- Redelivery is safe. The to-do is idempotent by `eventId`. If a delivery fails after the to-do but before or during the notice, a redelivery re-runs a no-op open and writes the notice once.
- Only `payload` is passed to the notice handler. `meta` goes only to the task handler.
