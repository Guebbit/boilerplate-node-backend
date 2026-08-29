# docs/modules/cart-checkout.md

## Purpose

Documents the `POST /cart/checkout` endpoint — the sole cart operation that writes into another module's collection. It orchestrates a fixed 9-step sequence across five modules to convert a cart into an order, with all validation resolved before any write occurs.

## Key elements

- **9-step sequence** — load account → resolve shipping method → resolve address → join lines against catalogue → evaluate cart rules → `reserveForOrder` → `create` order → conditional cart empty (on `__v`) → queue confirmation email.
- **Conditional cart clear** — the final write uses the `__v` read at the start, making exactly one of two parallel checkouts succeed; the loser gets `409`.
- **Race retraction** — the losing request deletes its already-created order and returns the inventory hold before answering `409`.
- **Analytics pair** — `checkout_completed` / `checkout_failed` events and the `cart_checkout_total` counter (labelled by outcome) are emitted here, not from `orders`.
- **Mapping boundary** — inventory receives product IDs and quantities only; the basket object is never passed across.

## Relationships

- **users** — loads the account record; a missing account is the one cart path that returns 404.
- **delivery** — calls `findShippingMethod` and `priceShipping` (pure functions); the cart never sees a shipment record.
- **account** — calls `addressForCheckout` to get the shipping address for this order.
- **products** — reads catalogue documents to price lines and verify pre-flight availability.
- **inventory-reservations** — step 6's `reserveForOrder` creates the hold; on race loss the hold is released.
- **inventory** — supplies `reserveForOrder`; checkout never touches a stock counter directly.
- **orders** — `create` is the one non-admin path that writes an order; the order is retracted if the cart race is lost.
- **cart** — this endpoint belongs to the cart module and is the source of its six dependency edges.

## Notes

- The step order **is** the correctness guarantee: steps 1–5 are pure reads/refusals (zero cost on failure); steps 6–9 are writes where a failure must undo prior work.
- The order is written **before** the cart is emptied, deliberately: a briefly-existing order is recoverable; an emptied cart with no order is a silently lost basket.
- `409` signals "superseded," not "failed" — the loser's lines now live on the winner's order, so a retry would just hit an empty cart.
- Changing the sequence or removing the `__v`-conditional clear re-introduces the double-charge race reachable by a double-clicked button.
