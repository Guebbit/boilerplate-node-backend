---
source: src/modules/orders/asyncapi.domain-events.yaml
generated_at: 2026-11-22T06:07:13.003152+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/asyncapi.domain-events.yaml

## Purpose
AsyncAPI fragment (not a standalone document) declaring the domain events the orders module emits. It is merged into the backend-only `domain-events` section of `shared/contracts/asyncapi.domain-events.yaml`. It documents each event's channel, delivery semantics, and payload schema, so listeners in other modules know what to expect.

## Key elements
Every channel below has a matching `send` operation, a message component, and a payload schema. All payload schemas visible here use `additionalProperties: false`.

- **`domain.order.canceled`** (`order.canceled`, outbox): emitted when a cancel succeeds, after stock is restored. Payload requires `orderId`, `refund` (boolean), and `cause` (`customer`, `operator`, `withdrawal`, `reservation_expired`, `erasure`, `payment_mismatch`, `lost`). Optional `informedAt` is the date the shop was told, for buyer-initiated causes. It starts the 14-day refund deadline and is never published.
- **`domain.order.status_changed`** (`order.status_changed`, outbox): fires on any status move, including admin overrides. Payload has `orderId`, `from`, `to`, with the statuses referencing `OrderStatus` in `openapi.yaml`.
- **`domain.order.created`** (`order.created`, outbox): emitted once per order by `placeOrder` in `src/modules/orders/services/place.ts`. Payload is `orderId`.
- **`domain.order.status_overridden`** (`order.status_overridden`, outbox): an admin override moved the status forward by hand. `delivery` listens to it to align fulfillment orders and shipments. Payload includes `orderId`, `from`, `to`, `at`, `mode`.
- **`domain.order.billing_corrected`** (`order.billing_corrected`, outbox): staff changed who the order is invoiced to. `invoicing` listens to it.
- **`domain.order.redacted`** (`order.redacted`, outbox): `reap:orders` scrubbed the remaining personal data. It has no in-process subscriber and exists for the `order.redacted` webhook (GDPR Art. 19).
- **`domain.order.purchase_hold_placed`** (`order.purchase_hold_placed`, **in-process**, not outbox): a cancellation rule paused a buyer's checkout. `notifications` turns it into a staff notice.

## Relationships
- `src/modules/orders/openapi.yaml`: the `status_changed` payload reuses its `OrderStatus` schema through a `$ref`.
- `src/modules/orders/asyncapi.webhooks.yaml`: the descriptions say webhooks fire alongside these events. Webhooks fire for any status change, and the `order.redacted` event exists for its webhook.
- `src/modules/payments/asyncapi.domain-events.yaml`: the descriptions say `payments` opens its refund record from the canceled-order event. The sibling file likely holds the payments-side events, but its content isn't shown here.

## Notes
- Outbox events are written in the same transaction as the state change, so they are at-least-once. Listeners must dedupe on `meta.eventId`. `invoicing` does so because a redelivery would burn two numbers of a gap-free invoice series.
- `order.canceled` carries the refund policy (`refund`) explicitly rather than leaving listeners to infer it. The relay retries the event until `payments` has created the refund record.
- For `reservation_expired` cancels, `payments` answers for the transfer nobody sent. For any other hold, `orders` does.
- Status changes are not strictly forward-only. A lost shipment moves `shipped` back to `processing` (`reopen`), and `reship` moves a `delivered` order back. Listeners must allow for both.
- `status_changed` cannot tell an admin override from an ordinary system move. Use `status_overridden` to detect overrides. A forced shipment recorded through `delivery` is not an override.
- Descriptions for `created`, `status_overridden`, `billing_corrected`, `redacted`, and `purchase_hold_placed` are plain YAML scalars or quoted strings, while the first two channels use `>-` folded blocks. This is only a style difference.
