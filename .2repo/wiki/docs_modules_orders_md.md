# docs/modules/orders.md

## Purpose

Documents the **orders** module: the owner of placed orders, their frozen line items, the status state machine, and the invariants around what cancelling restores. It is the strongest aggregate candidate in the system and the module whose `status` enum acts as the public vocabulary three sibling modules react to.

## Key elements

- **Status enum** — `pending → paid → processing → shipped → delivered`, plus `cancelled` reachable from `pending` or `paid`. Each transition has a designated actor (checkout, payments, admin, delivery, or an expired hold).
- **Embedded `productSchema` in `items`** — the catalogue row is copied into the order at purchase time so later product edits cannot rewrite historical orders.
- **`userId: 1, deletedAt: 1` index** — supports both per-account reads and admin soft-delete in a single index lookup.
- **Domain events emitted** — `order.status_changed` (to delivery) and `order.cancelled` (to payments for refund).
- **Domain events consumed** — `inventory.reservation_expired` (triggers cancellation) and `user.deleted` (from the users module).

## Relationships

- **inventory** — solid dependency: orders reads units from inventory. Dotted: `reservation_expired` event flows *into* orders, triggering cancellation.
- **products** — solid dependency: orders embeds the product schema published through products' barrel export.
- **payments** — payments confirms `pending → paid`; in return, `order.cancelled` tells payments to issue a refund. No import either direction.
- **delivery** — `order.status_changed` tells delivery to create the parcel; delivery later advances the status to `delivered`.
- **cart / cart-checkout** — cart imports orders; checkout is the originator of `pending` orders.
- **manager (demo-ecommerce)** — the "admin" actor that writes, soft-deletes, and manually moves statuses.
- **tactical-ddd** — explains why orders is the primary aggregate candidate.
- **events-and-logging** — documents the lifecycle of `order.cancelled` and `reservation_expired`.
- **modules/index** — parent overview page.

## Notes

- **Do not change the `status` enum casually.** Three modules (payments, delivery, inventory) react to specific values; renaming or reordering breaks them silently.
- **Two reverse reactions are event-based, not import-based.** inventory→orders (expiry) and orders→payments (refund) are deliberately acyclic. Adding an import here creates a cycle.
- **Embedding vs. referencing is intentional.** The `productSchema` copy in `items` exists so an invoice cannot change after payment. Do not replace it with a foreign key to the live product row.
- Account-level reads are scoped by `userId`; all writes and soft-deletes are admin-only. The composite index is what keeps both paths cheap — adding a new query pattern may require a separate index.
