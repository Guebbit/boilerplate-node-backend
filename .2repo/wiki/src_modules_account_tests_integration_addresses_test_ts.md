# src/modules/account/tests/integration/addresses.test.ts

## Purpose

Integration test suite for the address book. It locks down three invariants: a non-empty book always has exactly one default (regardless of which write set it), a user's entries are invisible to other users (404, not 403), and the checkout resolver's three-way answer (default, named, stale-id rejection).

## Key elements

- **`HOME` / `OFFICE`** — two static address objects used across all cases to keep fixtures readable.
- **`defaults(userId)`** — helper that calls `accountService.addressesGet` and returns only the entries flagged `default`.
- **`cartWith(userId)`** — creates an in-stock product (10 on hand) and adds one unit to the user's cart; shared setup for every checkout case.
- **`describe('the one-default invariant')`** — five cases: first-entry auto-default, update-to-default demotes prior holder, add-with-`default:true` demotes atomically, update-with-`default:false` is a no-op on the flag, and removing the default promotes the oldest remaining entry.
- **`describe('ownership')`** — one case verifying that a stranger's update/remove of another user's entry returns `{ success: false, status: 404 }` and leaves the owner's data untouched.
- **`describe('checkout and the address')`** — four cases: default snapshot when no id is given, named entry overrides default, a stale/non-existent id returns 404 *without* reserving stock or mutating the cart, and an empty book yields a successful order with `shippingAddress` undefined.

## Relationships

- **`src/modules/account/services/index.ts`** — exercises `accountService.addressAdd / addressesGet / addressUpdate / addressRemove`; these are the system under test.
- **`src/modules/cart/index.ts`** — calls `cartService.cartItemAddById` (via `cartWith`) and `cartService.orderConfirm` (checkout cases).
- **`src/modules/products/index.ts`** — imports `productRepository` to assert stock state after the stale-id rejection.
- **`src/modules/products/repository.ts`** — `productRepository.findById` is used only in the stale-id test to confirm `onHand` and `reserved` are unchanged.
- **`src/modules/products/tests/fixtures.ts`** — `createProduct({ onHand: 10 })` inside `cartWith`.
- **`src/modules/users/tests/fixtures.ts`** — `createUser()` in every test; two users in the ownership case.
- **`tests/support/caller-context.ts`** — `testCallerContext` passed as the second argument to `cartService.orderConfirm`.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` invoked at module top level (once per file, before any test runs).

## Notes

- `setupTestDb()` runs at import time (module scope), not inside `beforeAll`; the entire file shares one DB connection.
- The stale-id test is the most defensive case: it asserts 404 **and** that stock (`onHand`, `reserved`) and cart length are unchanged, pinning the contract that address validation precedes any resource reservation.
- Cross-user access is asserted to return **404**, not 403 — the service deliberately does not distinguish "not found" from "not yours."
- The `default` field is a JS reserved word; the helper destructures it as `{ default: isDefault }` to avoid a syntax error.
