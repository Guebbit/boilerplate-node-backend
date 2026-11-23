---
source: src/modules/addresses/tests/factories.ts
source_sha256: 4d5cb0eb1b11e3bac2f46aef20dabbaab2414ca2c2b59f7fcdad61538058042f
context_sha256: a188790bc77343a6df257f791bf40be6d9574de3b69401a8f1c8bfdc53f161bd
generated_at: 2026-11-22T04:16:17.129953+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/addresses/tests/factories.ts

## Purpose
Test helper that gives an account an address-book entry. Checkout orders need a billing address, so tests that place orders for an account with an empty address book would be refused with `CART_BILLING_ADDRESS_REQUIRED`. This helper avoids that, so those tests stay focused on what they actually test.

## Key elements
- `giveAddress(userId: string): Promise<void>` — calls `addressService.create` for the account with a fixed entry (label `home`, "Ada Lovelace", Via Roma 1, Modena, 41121, IT). The entry becomes the account's default. The returned promise resolves to `undefined`, so callers get no address object back.

## Relationships
- Depends on `addressService` in `src/modules/addresses/service.ts` and writes through its `create` method, so it needs a database.
- Used by the cart integration tests (backorder, checkout-expected-total, checkout-interleavings, checkout-stock-moved, checkout-terms-version, line-availability, merge, preorder, product-removal-protects-orders, stock-flag, stock, totals). Also used by the cart API contract test (`src/modules/cart/tests/contract/api.contract.test.ts`) and the account shop contract test (`src/modules/account/tests/contract/shop.contract.test.ts`). These all need a valid billing address before placing orders.

## Notes
- The address data is fixed, with no overrides. Tests that need different address values must call `addressService` directly.
- Calling it twice for the same account creates two entries. The code shown does not say which one ends up as the default.
