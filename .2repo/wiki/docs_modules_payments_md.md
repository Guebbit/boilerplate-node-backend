# docs/modules/payments.md

## Purpose

Documents the payments module, which owns an order's money behind a provider port. The intent freezes an order's total; the confirm moves the order to `paid` and commits the inventory hold into a sale. It also handles the refund path triggered by `order.cancelled`.

## Key elements

- **Payment intent** — freezes an order's total amount; one intent per order (enforced by `unique: true` on `orderId`).
- **Confirm path** — the single moment a held inventory unit becomes a committed sale; moves order status to `paid` and commits held units directly (no event-announce-and-hope pattern).
- **Refund path** — responds to the `order.cancelled` event from the orders module; releases stock *and* returns money (unlike a bare cancellation).
- **Provider port** — the processor sits behind an interface under `providers/`; a fake implementation ships by default so the checkout-to-paid path runs in tests and the demo profile without a sandbox account.
- **User resolution** — the order's `userId` is resolved against the account record so the payer id on a payment document is queryable; an unresolvable payer is logged, not refused.

## Relationships

- **orders** — a payment is *about* an order. Orders announces `order.cancelled`; payments answers with the refund. The confirm path writes the order's status to `paid` and commits the order's held units.
- **inventory** — the confirm path commits the order's held units from inventory. Without this module, no hold ever becomes a sale and every reservation sits until its window expires.
- **inventory-reservations** — the hold that payments commits originates in the reservation lifecycle; payments is the terminal consumer of that hold.
- **users** — the `userId` on the order is resolved against the account record (groundwork for future "everything this account has paid" queries). No current feature is gated on this.
- **payments-provider-port** — defines the processor interface and the fake implementation that payments sits behind.
- **index.md** — lists this module as a top-level domain module.

## Notes

- The confirm path is the **only** place in the system where a hold becomes a sale. Changing it risks leaving orders reserved until their window expires.
- The fake provider is intentional, not a placeholder. Swapping in a real processor is one file behind an existing interface.
- `unique: true` on `orderId` is a **database-level** double-charge guard, not an application-layer check.
- Cancelling an order without this module still releases stock but returns no money — that asymmetry is what `CANCELLABLE_ORDER_STATUSES` documents.
- This file is documentation, not source. The actual implementation lives in the payments module directory referenced by the provider port page.
