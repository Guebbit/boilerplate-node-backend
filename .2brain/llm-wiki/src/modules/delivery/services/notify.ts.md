---
source: src/modules/delivery/services/notify.ts
sha256: 6137760e33c0605772da305f7a48bf604da73fed81c4f778d69d038f1407681c
generated_at: 2026-10-14T15:31:11.944238+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/services/notify.ts

## Purpose

Sends best-effort buyer emails after a shipment transaction has already committed. Three events are covered — shipped ("on its way"), delivered ("arrived"), and a preorder delay notice. A failed email never undoes the underlying act; the shipment or notice is already a fact by the time this file runs.

## Key elements

- **`emailLines`** (private) — Maps a `ShipmentDocument`'s lines to a flat `{ title, quantity }[]` for embedding in email bodies.
- **`notifyShipped(order, shipment, remainingUnits)`** — Enqueues the carrier/"on its way" email via `orderService.mailBuyer`, then writes an operator-facing `logger.info` line with tracking code.
- **`notifyDelivered(orderId, shipment)`** — Re-fetches the order by id (to see the freshly-written `withdrawUntil`), then enqueues the "arrived" email. Includes the withdrawal deadline only when the order has reached `OrderStatus.delivered`.
- **`notifyDelayed(order, delayed)`** — Enqueues the preorder-delay notice email, including agreed/expected dates, whether an answer is needed, and a frontend link to the order page.

## Relationships

- **`src/infrastructure/adapters/mailer.ts`** — Calls `enqueueEmail` for every email sent (fire-and-forget; promise is `void`-ed).
- **`src/infrastructure/adapters/logger.ts`** — Uses `logger.info` for the operator log line in `notifyShipped`.
- **`src/modules/delivery/emails.ts`** — Imports the three email template builders: `shipmentShippedEmail`, `shipmentDeliveredEmail`, `preorderDelayedEmail`.
- **`src/modules/delivery/model.ts`** — Consumes the `ShipmentDocument` type.
- **`src/modules/delivery/events.ts`** — Consumes the `FulfillmentOrderDelayed` event type.
- **`src/modules/orders/index.ts`** — Imports `orderService` (for `mailBuyer`, `getById`) and `orderFrontendLink`.
- **`src/modules/orders/model.ts`** — Consumes the `OrderDocument` type.
- **`src/types/index.ts`** — Imports `OrderStatus` (used to gate the `withdrawUntil` field).
- **Callers (graph neighbors):** `ship.ts`, `deliver.ts`, `fulfill.ts`, and `notice.ts` invoke these three notify functions after their respective commit steps. `fulfillment.test.ts` exercises the paths end-to-end.

## Notes

- All three exports are post-commit, best-effort: a mail failure is handled inside `orderService.mailBuyer` (log + fall back to the stored address) and does **not** propagate to the caller as a shipment error.
- `notifyDelivered` re-reads the order via `getById` because the `order` object that existed before the deliver transaction lacks the `withdrawUntil` value written *in* that transaction.
- `void enqueueEmail(...)` is intentional — the promise is not awaited so a mailer outage cannot block the response.
- The `Stryker disable` comment on the logger line suppresses mutation testing for that specific statement (it is a side-effect-only log, not testable through return values).
