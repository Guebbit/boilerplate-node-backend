---
source: src/modules/addresses/tests/integration/checkout.test.ts
sha256: 43ddb540a1d6c4763346b133cb0c9862bc3938a308b50c8f44a1917a04c2ff77
generated_at: 2026-10-29T03:10:44.120889+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/tests/integration/checkout.test.ts

## Purpose

Integration tests for how the address book feeds into order confirmation: which address gets snapshotted as shipping vs. billing, how default vs. named entries are resolved, and what happens when the supplied ID is stale, foreign, or inapplicable. It lives outside the rest of the address-book suite because it drags in the cart and order modules; removing the shop removes exactly this file.

## Key elements

- **`cartWith(userId)`** — shared setup helper: creates one in-stock product and adds a single unit to the user's cart, returning the product so later assertions can verify stock was not reserved.
- **`describe('checkout and the address')`** — shipping-address resolution: default snapshot, named-entry override, stale-ID 404, foreign-ownership 404, pickup (no shipping address), and empty-book 422.
- **`describe('checkout and the billing address')`** — billing-address resolution: "same as shipping" fallback, named billing override, digital-only baskets (no shipping frozen), named billing for digital, missing-billing 422, shipping-addressId on digital basket → 409 `CART_ADDRESS_NOT_APPLICABLE`, foreign billing → 404, and country-constraint asymmetry (billing not held to ship-to countries).
- **Fixtures** — `HOME` and `OFFICE` from `./fixtures` provide two known address shapes (Ada Lovelace, Via Roma 1 / Via Milano 2) used throughout assertions.

## Relationships

- **`src/modules/addresses/service.ts`** — calls `addressService.create` and `addressService.list` to seed and query the user's address book before each checkout.
- **`src/modules/addresses/tests/integration/fixtures.ts`** — source of the `HOME` / `OFFICE` address objects.
- **`src/modules/cart/index.ts`** (re-exports from **`src/modules/cart/services/index.ts`**) — the system under test: `cartService.addItemById`, `setShippingMethod`, `orderConfirm`, `getForBadge`.
- **`src/modules/users/tests/factories.ts`** — `createUser` to provision test accounts (owner, stranger, etc.).
- **`src/modules/products/tests/factories.ts`** — `createProduct` (stock / digital variants) and `readProduct` (verify stock was not reserved after a rejected checkout).
- **`src/modules/orders/tests/factories.ts`** — `countOrders` to assert no order row was persisted when checkout is refused.
- **`tests/support/callers.ts`** — `testCallerContext` supplied to `orderConfirm` as the auth/session context.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` resets the database before the suite runs.

## Notes

- **Ownership, not just existence.** The foreign-address test (both shipping and billing) exists specifically to prove the resolver rejects another user's valid ID with the same 404 + `CART_ADDRESS_NOT_FOUND` as a random hex string. The comment in the file calls out that collapsing the return type would silently downgrade this to "no address" — the test guards against that regression.
- **Failure is atomic.** Every rejection test asserts *nothing moved*: product `reserved` stays 0, cart still has its item, and `countOrders` is 0. The address check runs before any stock hold.
- **Digital-only + `addressId` → 409, not 404.** Passing a shipping address ID on a digital-only basket is a *semantic* conflict (`CART_ADDRESS_NOT_APPLICABLE`), distinct from the "not found" case — the test pins this distinction.
- **Billing country constraint is looser.** The final (truncated) test asserts a JP billing address is accepted for a digital order even though JP is presumably outside the ship-to list; shipping addresses remain constrained.
