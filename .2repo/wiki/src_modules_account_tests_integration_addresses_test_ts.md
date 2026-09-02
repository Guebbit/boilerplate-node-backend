# src/modules/account/tests/integration/addresses.test.ts

## Purpose

Integration tests for the user address book. The file pins three behavioural contracts: the **single-default invariant** (a non-empty book always has exactly one default address, regardless of which write established it), **ownership isolation** (foreign entries are indistinguishable from nonexistent ones — 404, not 403), and the **checkout address resolver** (default fallback, explicit-ID override, and hard-fail on stale/foreign IDs with zero side-effects).

## Key elements

- **`HOME` / `OFFICE`** – two fixed address fixtures (Modena, IT) used throughout all test cases.
- **`defaults(userId)`** – local helper that calls `accountService.addressesGet` and filters to entries where `default === true`; every invariant assertion runs through it.
- **`cartWith(userId)`** – local helper that creates an in-stock product (`onHand: 10`) and adds one unit to the caller's cart; returns the product for later stock-state assertions.
- **`describe('the one-default invariant', …)`** – five cases covering: first-add auto-defaults, explicit default-claim via update, default-claim via add, `default: false` being a no-op on assignment, and promotion of the oldest entry on removal of the current default.
- **`describe('ownership', …)`** – verifies that `addressUpdate` and `addressRemove` on another user's entry both return `success: false / status: 404` and leave the owner's data untouched.
- **`describe('checkout and the address', …)`** – five cases exercising `cartService.orderConfirm`: default fallback, named-ID override, stale-ID 404 with zero side-effects, foreign-ID 404 with zero side-effects (no order row, no stock reservation), and empty-book success with `shippingAddress` undefined.

## Relationships

- **`src/modules/account/services/index.ts`** – primary subject under test; calls `addressAdd`, `addressUpdate`, `addressRemove`, `addressesGet`.
- **`src/modules/cart/index.ts` / `src/modules/cart/services/index.ts`** – exercises `cartItemAddById` and `orderConfirm` (the checkout address-resolution path).
- **`src/modules/orders/index.ts` / `src/modules/orders/repository.ts`** – uses `orderRepository.count` to assert no order row was created in failure cases.
- **`src/modules/products/index.ts` / `src/modules/products/repository.ts`** – uses `productRepository.findById` to assert stock/reservation state is unchanged after a failed checkout.
- **`src/modules/products/tests/fixtures.ts`** – `createProduct` builds the in-stock product for cart setup.
- **`src/modules/users/tests/fixtures.ts`** – `createUser` provisions isolated user accounts (owner/stranger pairs, single-user cases).
- **`tests/support/caller-context.ts`** – `testCallerContext` supplied to `orderConfirm`.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` called once at module load to prepare a clean database.

## Notes

- Failure-path checkout tests assert **three** side-effect invariants each: product `onHand` unchanged, `reserved` is 0, and cart still holds its original item count. The address check is documented as running *before* any reservation, so the tests guard against a regression where the check is moved later.
- The foreign-ID checkout case carries an inline comment explaining *why* it exists separately from the stale-ID case: `addressForCheckout` resolves against the caller's own book, so the split return type must distinguish "not found in my book" from "not found at all" — collapsing it would let a foreign ID silently downgrade to "no address" instead of 404.
- Ownership tests expect **404**, not 403, deliberately — the API contract is "unknown entry," not "forbidden entry."
- `setupTestDb()` runs at import time (top-level call), so the entire file shares one database session; test ordering within a `describe` block matters if you add stateful cases.
