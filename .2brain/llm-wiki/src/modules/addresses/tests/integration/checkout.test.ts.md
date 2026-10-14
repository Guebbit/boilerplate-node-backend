---
source: src/modules/addresses/tests/integration/checkout.test.ts
sha256: 5ae833053b6f20668b414165b79b9605c631e9ed745daff0654775c7704a1c07
generated_at: 2026-10-14T14:54:37.065091+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/tests/integration/checkout.test.ts

## Purpose

Integration tests that verify how the address resolver snapshots shipping and billing addresses onto a confirmed order. It covers default-address resolution, explicit named-entry selection, cross-user ownership enforcement, the split requirement between shipping and billing, and the digital-only (no-ship) path. It lives separately from the rest of the address-book suite because it needs a cart and an order in scope.

## Key elements

- **`cartWith(userId)`** — local helper; creates an in-stock product and adds one unit to the user's cart. Shared setup for every test.
- **`describe('checkout and the address')`** — shipping-address scenarios: default snapshot, named-entry override, stale/foreign id → 404 `CART_ADDRESS_NOT_FOUND`, pickup (no shipping address), empty book → 422 `CART_BILLING_ADDRESS_REQUIRED`.
- **`describe('checkout and the billing address')`** — billing-address scenarios: same-as-shipping default, named billing entry, digital-only basket (no shipping frozen), rejection of `addressId` on digital-only → 409 `CART_ADDRESS_NOT_APPLICABLE`, cross-user billing → 404, country validation boundary (truncated).
- **`HOME`, `OFFICE`** (from `./fixtures`) — two fixed address objects used throughout; `HOME` = "Via Roma 1 / Ada Lovelace", `OFFICE` = "Via Milano 2".

## Relationships

- **`src/modules/addresses/service.ts`** — exercises `addressAdd` and `addressesGet` to populate and query the address book before checkout.
- **`src/modules/cart/index.ts`** — calls `cartService.cartItemAddById`, `cartShippingMethodSet`, `orderConfirm`, `cartGetForBadge`; the file's primary SUT.
- **`src/modules/cart/services/index.ts`** — implementation behind the `cartService` import; the resolver logic under test.
- **`src/modules/products/tests/factories.ts`** — `createProduct` seeds stock; `readProduct` asserts `onHand`/`reserved` after failures.
- **`src/modules/users/tests/factories.ts`** — `createUser` provisions test accounts (including the "stranger" / "owner" pairs).
- **`src/modules/orders/tests/factories.ts`** — `countOrders` confirms no order row was created on refused checkouts.
- **`tests/support/callers.ts`** — `testCallerContext` supplies the authenticated caller for `orderConfirm`.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the database per test run.
- **`./fixtures`** — `HOME` and `OFFICE` address literals.

## Notes

- Every failure-path test asserts **no side effects**: stock unreserved, cart item count unchanged, zero orders created. This is a deliberate invariant, not incidental.
- The cross-user test (both shipping and billing) encodes that a *real but foreign* address id is indistinguishable from a *nonexistent* one (same 404 / `CART_ADDRESS_NOT_FOUND`). The inline comment notes the split return type exists specifically so this case cannot silently degrade to "no address".
- Digital-only baskets reject a shipping `addressId` with **409** `CART_ADDRESS_NOT_APPLICABLE`, not 404 — the id is valid, just inapplicable to the basket type.
- The file is intentionally co-located under `addresses/tests/integration/` rather than `cart/tests/` or `orders/tests/` so that removing the shop (cart + orders) removes only this file, as the module docstring states.
