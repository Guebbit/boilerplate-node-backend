# docs/modules/delivery.md

## Purpose

Models the delivery domain: shipping rates (as pure functions), shipment records, and a fake courier that transitions parcels from `shipped` to `delivered`. Exists so the shop can price and track deliveries per order without an external integration.

## Key elements

- **`findShippingMethod`** – Pure function (in `domain/`) that selects an applicable shipping method. Called by `cart` during checkout pricing.
- **`priceShipping`** – Pure function (in `domain/`) that computes the cost for a chosen method. Called by `cart` during checkout pricing.
- **Shipment record** – Persisted parcel tied to an order (`unique: true` on `orderId` enforces one parcel per order).
- **Fake courier** – Advances a shipment through `shipped → delivered`. Exists so tests and the demo profile can complete the flow without a real carrier integration.
- **Shipped email notification** – Outbound email addressed in the recipient's language (language read from the user account).

## Relationships

- **`cart.md`** – Prices a shipping method through `findShippingMethod` and `priceShipping` without touching this module's HTTP surface or shipment records. This is a *published-language* edge: the cart receives vocabulary (rates), not state. The arrow is dashed on the dependency map.
- **`orders.md`** – A shipment is *about* an order; orders carry a `shippingCost` sourced from this module.
- **`users.md`** – Narrow dependency: reads the account solely to resolve the recipient's language for the shipped email.
- **`cart-checkout.md`** – The cart's checkout step calls through `findShippingMethod` / `priceShipping` to obtain the delivery line item (see `cart.md` for the pricing path).

## Notes

- **Breaking risk:** Changing the signatures or semantics of `findShippingMethod` or `priceShipping` directly breaks the cart's checkout pricing.
- **Published-language edge:** Because the rates live in `domain/` as pure functions, the cart never learns that a shipment record exists. This is the strongest (and most fragile) coupling on the map—treat the function contracts as a public API.
- **One parcel per order:** Enforced by `unique: true` on `orderId`. Do not add a second shipment for the same order without revising this constraint.
- **Clean removal:** Deleting this module simply drops `shippingCost` from orders; the build does not break. This was the shop's state before the module existed.
