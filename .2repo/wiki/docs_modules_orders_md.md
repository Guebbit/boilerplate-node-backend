# docs/modules/orders.md

## Purpose

Documents the orders module: the aggregate that owns line-item snapshots, the order status state machine, and the semantics of cancellation (unit release + refund). It exists to make the invariants explicit so no other module silently reinterprets them.

## Key elements

- **`items` (line items)** — each row embeds `productSchema` directly (a frozen snapshot), not a reference to `products`. Guarantees an order's history is immutable even if the catalogue changes.
- **`status` enum** — `pending` → `paid` → `processing` → `shipped` → `delivered`, with `cancelled` reachable from `pending` or `paid`. This is the module's public vocabulary; transitions are driven by specific actors (checkout/admin, `payments`, `delivery`, expired holds).
- **`userId: 1, deletedAt: 1` index** — supports the two dominant queries in one lookup: "give me this account's live orders" and "soft-delete an order."
- **Permissions** — reads are scoped to the owning account; writes and soft-deletes are admin-only.

## Relationships

- **`products`** — supplies the `productSchema` shape and serialisation transform that `items` embeds at order time.
- **`inventory` / `inventory-reservations`** — holds units when an order enters `pending`; emits `reservation.expired` which can transition the order to `cancelled`.
- **`payments`** — confirms payment → `paid`; listens for `order.cancelled` to issue a refund.
- **`delivery`** — drives the `processing → shipped → delivered` fulfilment leg.
- **`cart` / `cart-checkout`** — upstream; checkout is the actor that creates an order in `pending` state.
- **`index`** — the modules overview page that places orders in the wider context map.

## Notes

- **Breaking change:** modifying the `status` enum ripples into at least three other modules (`payments`, `delivery`, `inventory-reservations`). Treat it as a shared contract.
- **No direct imports across the cycle.** `inventory` cancels orders and `orders` announces `order.cancelled` exclusively through events, which keeps the dependency graph acyclic. Do not replace these with synchronous calls.
- **Embedding vs. referencing:** `items` stores the full product shape, not an ID lookup. This is deliberate (invoice integrity) — do not "simplify" it to a foreign key.
