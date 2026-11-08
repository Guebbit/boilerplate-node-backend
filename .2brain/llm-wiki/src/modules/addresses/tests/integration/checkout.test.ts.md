---
source: src/modules/addresses/tests/integration/checkout.test.ts
sha256: 43ddb540a1d6c4763346b133cb0c9862bc3938a308b50c8f44a1917a04c2ff77
generated_at: 2026-11-08T04:57:39.710969+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/tests/integration/checkout.test.ts

## Purpose

Integration tests for address resolution during checkout: which address (default, named, or none) gets frozen as the shipping and/or billing snapshot on an order. Covers the full decision matrix — standard vs. pickup shipping, physical vs. digital baskets, stale/foreign IDs, and empty address books — verifying both the happy-path snapshot content and that refused checkouts leave no side effects.

## Key elements

- **`cartWith(userId)`** — Shared setup helper: creates one in-stock product and adds it to the user's cart.
- **`describe('checkout and the address')`** — Tests the *shipping* address path:
  - Default address resolved when no `addressId` is passed.
  - Named address overrides the default.
  - Stale (non-existent) `addressId` → 404 `CART_ADDRESS_NOT_FOUND`, inventory and cart untouched.
  - Another user's valid `addressId` → same 404 (ownership, not just existence).
  - Pickup shipping → no `shippingAddress`, but billing still resolved.
  - Empty address book → 422 `CART_BILLING_ADDRESS_REQUIRED` before any inventory hold.
- **`describe('checkout and the billing address')`** — Tests the *billing* address path:
  - Billing defaults to shipping address ("same as shipping").
  - Named `billingAddressId` decouples billing from shipping.
  - Digital-only basket: no `shippingAddress`, billing required.
  - Passing `addressId` on a digital-only basket → 409 `CART_ADDRESS_NOT_APPLICABLE` (not silently ignored).
  - Foreign `billingAddressId` → 404, no order created.
  - Billing address is **not** constrained by ship-to-country restrictions (e.g. JP allowed for billing).

## Relationships

- **`src/modules/addresses/service.ts`** — `addressService.create` / `.list` set up and read the user's address book under test.
- **`src/modules/cart/index.ts`** — Exports `cartService`, the primary SUT (`orderConfirm`, `setShippingMethod`, `addItemById`, `getForBadge`).
- **`src/modules/cart/services/index.ts`** — Upstream implementation of the cart service invoked by the tests.
- **`./fixtures`** — `HOME` and `OFFICE` address fixtures used throughout.
- **`src/modules/users/tests/factories.ts`** — `createUser` builds test users (owner/stranger pairs for cross-user tests).
- **`src/modules/products/tests/factories.ts`** — `createProduct` (physical and `requiresShipping: false` digital), `readProduct` to assert inventory is untouched after a refused checkout.
- **`src/modules/orders/tests/factories.ts`** — `countOrders` asserts zero orders were persisted after a failure.
- **`tests/support/setup-test-db.ts`** — `setupTestDb` initialises the database for the suite.
- **`tests/support/callers.ts`** — `testCallerContext` provides the authenticated caller identity passed to `orderConfirm`.

## Notes

- **Deliberate isolation from the address-book suite**: the file header explains it is kept separate because it depends on cart and order infrastructure; removing the shop module should remove this file with it.
- **Ownership vs. existence**: the foreign-ID test exists to pin the *ownership* invariant, not merely "id doesn't exist." A comment notes that collapsing the resolver's split return type (found-but-not-yours vs. not-found) would silently downgrade a foreign ID to "no address."
- **Side-effect assertions are repeated**: every failure test checks inventory (`onHand`/`reserved`), cart contents, and `countOrders === 0` to prove the address check runs *before* any inventory hold.
- **Digital-only 409 is a distinct code** (`CART_ADDRESS_NOT_APPLICABLE`) from the 404 (not found) and 422 (required) paths — tests guard against conflating them.
