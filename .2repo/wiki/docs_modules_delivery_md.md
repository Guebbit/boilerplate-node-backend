# docs/modules/delivery.md

## Purpose

Documents the delivery module, which owns shipping-rate calculations, shipment records, and a fake courier that advances parcels from `shipped` to `delivered`. It exists so the cart can price a checkout against pure rate functions without learning that a shipment record exists, and so the order lifecycle can create a parcel and notify the recipient when shipping begins.

## Key elements

- **`findShippingMethod`** — pure function in `domain/`; resolves the applicable shipping method for a checkout.
- **`priceShipping`** — pure function in `domain/`; returns the cost for a given method. Together these form the published-language surface the cart consumes.
- **Shipment record** — one per order (`unique: true` on `orderId`); carries a tracking code and links back to the order.
- **Fake courier** — advances `shipped → delivered` via `POST /delivery/advance` (an admin button, not a schedule). Exists so tests and the demo profile can reach the delivered state without an external integration.
- **Shipped email** — sent in the recipient's language; the only reason this module reads the `users` module.

## Relationships

- **→ [`orders`](./orders.md):** delivery imports orders to attach a shipment to its order. In return, orders emits the `order.status_changed` domain event that triggers shipment creation when status becomes `shipped`.
- **→ [`users`](./users.md):** delivery reads the recipient's account solely to localise the shipped notification email.
- **[`cart`](./cart.md) → delivery:** cart calls `findShippingMethod` and `priceShipping` directly as pure functions — no HTTP, no record access. This is the strongest (published-language) edge in the module graph.
- **[`cart-checkout`](./cart-checkout.md):** the checkout flow is the consumer context for the rate functions.
- **[`domain-layer`](../theory/domain-layer.md):** explains why the rates live as pure functions in `domain/` rather than as service methods.
- **[`strategic-ddd`](../theory/strategic-ddd.md):** defines the *published-language* pattern that the cart→delivery edge exemplifies.
- **[`email-and-rendering`](../tools/email-and-rendering.md):** the shipped notification is rendered and sent through this tooling.
- **[`index`](./index.md):** this module appears in the top-level module index.

## Notes

- The two halves of the module (pure rates vs. shipment records) **never touch each other**. The cart only ever reaches the left side; the right side is internal to delivery.
- Breaking `findShippingMethod` or `priceShipping` signatures breaks the cart's pricing path — treat them as a public contract.
- The fake courier is intentional, parallel to the fake payment provider; there is no real carrier integration to stub out.
- One parcel per order is enforced by a `unique` constraint, not by application logic.
