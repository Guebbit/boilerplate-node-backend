# src/modules/account/tests/integration/addresses.test.ts

## Purpose
Integration tests for the user address book. Validates three invariants end-to-end: (1) a non-empty book always has exactly one default, (2) one user's entries are invisible to another (404 parity with a nonexistent id), and (3) the checkout resolver's three-way answer (named id, default, or no address at all).

## Key elements
- **`HOME` / `OFFICE`** – Shared fixture objects (label, fullName, street, city, zip, country) reused across all describes.
- **`defaults(userId)`** – Helper that fetches the address view and returns only entries where `default` is true.
- **`cartWith(userId)`** – Creates one in-stock product (`onHand: 10`) and adds it to the user's cart; returns the product for later stock assertions.
- **`describe('the one-default invariant')`** – Five tests covering: first-entry auto-default, explicit reassignment via update, reassignment via add-with-`default:true`, `default:false` as a no-op, and promotion of the oldest remaining entry on deletion.
- **`describe('ownership')`** – Verifies cross-user update/remove both return `404` and leave the owner's record untouched.
- **`describe('checkout and the address')`** – Four tests covering: default snapshot when no id is passed, named-id overrides default, stale id rejects with 404 *before* any stock/cart mutation, and empty book produces a successful order with `shippingAddress === undefined`.

## Relationships
- **`src/modules/account/services/index.ts`** – Primary subject under test; exercises `addressAdd`, `addressUpdate`, `addressRemove`, `addressesGet`.
- **`src/modules/cart/index.ts`** (→ `src/modules/cart/services/index.ts`) – Exercises `cartItemAddById` and `orderConfirm` for the checkout-resolution tests.
- **`src/modules/products/index.ts`** (→ `src/modules/products/repository.ts`) – Uses `productRepository.findById` to assert stock was *not* reserved after a failed checkout.
- **`src/modules/products/tests/factory.ts`** – `createProduct` seeds an in-stock item for cart setup.
- **`src/modules/users/tests/factory.ts`** – `createUser` seeds the test accounts (owner / stranger / generic).
- **`tests/support/caller-context.ts`** – `testCallerContext` supplied to `orderConfirm`.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` called at module load to seed a clean in-memory DB.

## Notes
- `setupTestDb()` runs once at import time, not per-test; all tests share a single DB snapshot.
- The stale-id test is the key ordering guard: it asserts `onHand` is still 10 and `reserved` is 0, proving the address check fires *before* any stock hold or cart clear.
- `default: false` in an update is explicitly a **no-op** on the default slot (test asserts length stays 1) — it does not demote.
- An empty address book is a *valid* checkout path (order succeeds, `shippingAddress` is `undefined`), not an error case.
