# src/modules/delivery/index.ts

## Purpose

Public barrel (re-export) for the delivery module. It exposes the module's entire external API as two pure functions so that sibling modules (notably cart/checkout) can price a shipping method without any knowledge of the module's internal entities (shipments, couriers, repositories).

## Key elements

- **`findShippingMethod`** — re-exported from `./domain`; resolves a shipping method (by ID or other criteria) for pricing.
- **`priceShipping`** — re-exported from `./domain`; returns the cost for a resolved method. This is the single number an order freezes at checkout.

## Relationships

- **`src/modules/delivery/domain/index.ts`** — Source of both re-exports. All logic lives there; this file is a pass-through with no added behavior.
- **`src/modules/cart/services/checkout.ts`** — Primary consumer. Checkout calls `findShippingMethod` / `priceShipping` to compute the shipping line-item, ensuring the price an order locks in matches the price the delivery `/methods` endpoint quotes.

## Notes

- By design this file contains **no runtime code** — only re-export statements. Adding side effects or extra exports here violates the "published language" rule described in the file's doc-comment.
- The comment references `modules/products/index.ts` as the canonical example of the barrel convention; both barrels follow the same pattern.
