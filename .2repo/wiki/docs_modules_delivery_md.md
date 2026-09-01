# docs/modules/delivery.md

## Purpose

Documents the delivery module: shipping rates, shipment (parcel) records, and the fake courier that transitions shipments through `shipped → delivered`. Exists to centralize how the shop prices and tracks physical shipping of an order.

## Key elements

- **`findShippingMethod`** — pure function in `domain/`; selects a shipping method. Called by cart during checkout pricing.
- **`priceShipping`** — pure function in `domain/`; returns the cost for a selected method. Called by cart during checkout pricing.
- **Shipment record** — DB entity tied to one order (`unique: true` on `orderId`). Carries the `shippingCost` back onto the order.
- **Fake courier** — stub that advances a shipment from `shipped` to `delivered` without any external integration (mirrors the fake payment provider).
- **Shipped notification** — email rendered in the recipient's language (read from the `users` account).

## Relationships

- **`orders`** — a shipment is *about* an order; removing this module means orders simply stop carrying `shippingCost`.
- **`cart` / `cart-checkout`** — prices a method via `findShippingMethod` + `priceShipping` without touching delivery's HTTP surface or learning that a shipment record exists. This is a `published-language` (dashed) edge.
- **`users`** — narrow dependency: reads the account solely to choose the language of the shipped-notification email.
- **`domain-layer`** — the shipping-rate functions live in `domain/` as pure functions; see that page for the rationale.
- **`email-and-rendering`** — owns the actual rendering/sending of the shipped notification that this module triggers.
- **`strategic-ddd`** — explains the `published-language` boundary that makes the cart→delivery arrow dashed.

## Notes

- **One parcel per order.** The `unique: true` constraint on `orderId` is the only cardinality guard; there is no multi-parcel path.
- **Breaks if you change** `findShippingMethod` or `priceShipping` signatures — the cart calls both at checkout and will fail at the type/contract level.
- **Clean removal.** Deleting the module removes the selector, parcel records, and cost, but the build stays green; orders revert to the pre-module state.
- The courier is deliberately fake in both test and demo profiles; there is no real carrier integration behind it.
