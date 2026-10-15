---
source: src/modules/users/tests/integration/minimise.test.ts
sha256: b42cb587793e0a57a3031a2206a5a9b62728f9966178e90b9f71cd3dbc5bbd4c
generated_at: 2026-10-15T12:14:00.005711+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/minimise.test.ts

## Purpose

Integration test for the inactivity-minimisation feature, exercised through the real module wiring (registry + event bus). Verifies that an account quiet past the cutoff loses its address book, has its orders' PII clock started, retains its login and orders, and is stamped so a rerun is a no-op — and that a failed hook prevents the stamp so the next run retries.

## Key elements

- **`makeInactive(id, extra?)`** — Backdates a user's `createdAt` (via `overwriteImmutable`) to `LONG_AGO` (2020-01-01) so the account falls past the inactivity cutoff. Accepts extra fields (e.g. `active: false`, `lastActiveAt`).
- **`addressesOf(userId)`** — Wraps `addressesGet` to return just the array of addresses for assertions.
- **`clockOf(orderId)`** — Reads `anonymizeAfter` from the order via `orderRepository`.
- **`isMinimised(userId)`** — Checks whether the `inactivityMinimisedAt` field exists on the user document.
- **`inactiveCustomerWithOrder(name)`** — Composite fixture: creates a customer, gives them an address, creates one paid order with a product, then backdates the account. Returns `{ user, orderId }`.
- **`describe('inactivity minimisation')`** — Six test cases:
  1. Happy path: drops addresses, starts PII clock, keeps login/orders, stamps account.
  2. Banned account (`active: false`) is minimised the same way.
  3. Rerun is a no-op (`minimised: 0`, clock unchanged).
  4. Active account is left untouched.
  5. "Boomerang": a minimised account that became active and quiet again is minimised a second time.
  6. A failing `minimise` hook in a registered module causes `failed: 1` and the account is **not** stamped (retry semantics).

## Relationships

- **`src/modules/users/services/index.ts`** — Calls `userService.minimiseInactiveBefore(cutoff)`, the system under test.
- **`src/modules/users/tests/factories.ts`** — `createUser` builds the account fixture.
- **`src/modules/users/model.ts`** — `userModel` is used directly for backdating (`overwriteImmutable`) and for asserting the `inactivityMinimisedAt` stamp.
- **`src/modules/users/module.ts`** — `usersModule` is registered (in the failure test it is paired with a fake module via `registerModules`).
- **`src/modules/users/repository.ts`** — `userRepository.findById` reloads the user to assert email is preserved.
- **`src/modules/addresses/module.ts`** — `addressesModule` is registered in `beforeEach` via `registerCheckoutModules`.
- **`src/modules/addresses/index.ts`** — `addressesGet` is used to assert the address book was dropped.
- **`src/modules/addresses/tests/factories.ts`** — `giveAddress` attaches an address in fixtures.
- **`src/modules/orders/tests/factories.ts`** — `createOrder`, `toOrderItem`, `markOrderPaidAt` build the paid-order fixture.
- **`src/modules/orders/repository.ts`** — `orderRepository.findById` reads the PII clock (`anonymizeAfter`).
- **`src/modules/products/tests/factories.ts`** — `createProduct` supplies the order line item.
- **`src/kernel/registry.ts`** — `registerModules` is called directly in the hook-failure test to swap in a module whose `minimise` hook rejects.
- **`src/kernel/events.ts`** — `resetDomainEvents` runs in `afterEach` to isolate the event bus between tests.
- **`tests/support/checkout-modules.ts`** — `registerCheckoutModules` sets up the standard module list for the happy-path tests.

## Notes

- `createdAt` is normally immutable; the tests bypass this with `overwriteImmutable: true`. Any production code that relies on `createdAt` being stable should be aware of this test-only escape hatch.
- The hook-failure test calls `registerModules` **directly** (not via `registerCheckoutModules`), replacing the entire registry with a fake module + `usersModule`. This is intentional to isolate the failure path.
- The "boomerang" test manually overwrites `inactivityMinimisedAt` to an old date to simulate that the account was active and then quiet again after the first minimisation — the service logic presumably compares `lastActiveAt` against `inactivityMinimisedAt` to decide re-eligibility.
- `LONG_AGO` is a fixed 2020-01-01 timestamp, not a relative offset; the `daysAgo(30)` cutoff is relative. This guarantees the account is always past the cutoff regardless of when the suite runs.
