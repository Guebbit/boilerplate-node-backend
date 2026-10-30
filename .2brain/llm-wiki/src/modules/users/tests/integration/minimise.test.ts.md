---
source: src/modules/users/tests/integration/minimise.test.ts
sha256: 38792d222ed8f33b6cdb29d9104e22a9eba1ad33dd0d76c91dbf2b0b3db5bf64
generated_at: 2026-10-29T06:21:08.696630+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/minimise.test.ts

## Purpose

Integration test for the inactivity-minimisation flow: it verifies that accounts quiet past a configurable window lose their address book, start the PII clock on their orders, retain login credentials and order records, and receive an `inactivityMinimisedAt` stamp. It also covers edge cases (banned accounts, idempotent reruns, re-activation cycles, and hook-failure retry).

## Key elements

- **`inactiveCustomerWithOrder(name)`** — shared fixture: creates a customer, attaches an address, creates a paid order, and backdates the account so it qualifies as inactive.
- **`makeInactive(id, extra?)`** — utility that overwrites `createdAt` (via `overwriteImmutable`) and optionally other fields to simulate inactivity.
- **`daysAgo(days)`** — returns a `Date` N days before the current moment, used as the minimisation cutoff.
- **`addressesOf` / `clockOf` / `isMinimised`** — read helpers that assert post-conditions on addresses, order PII clocks, and the minimisation stamp.
- **`describe('inactivity minimisation', …)`** — six `it` blocks covering: happy-path minimisation, banned accounts, rerun idempotency, active-account no-op, boomerang (re-minimisation after reactivation), and hook-failure (no stamp written so the next run retries).

## Relationships

- **`@kernel/registry` (`registerModules`)** — used in the hook-failure test to inject a synthetic module whose `personalData.minimise` hook rejects, proving the stamp is not applied on partial failure.
- **`@kernel/events` (`resetDomainEvents`)** — called in `afterEach` to clear the event bus between tests.
- **`@tests/checkout-modules` (`registerCheckoutModules`)** — called in `beforeEach` to wire up the addresses module alongside users for the full minimisation pipeline.
- **`@modules/addresses/module` (`addressesModule`)** — registered so its `personalData.minimise` hook participates in the flow.
- **`@modules/addresses` (`addressService`)** — used to read back the user's address list after minimisation.
- **`@modules/addresses/tests/factories` (`giveAddress`)** — seeds an address for the test user.
- **`@modules/orders/tests/factories`** — provides `createOrder`, `toOrderItem`, `markOrderPaidAt`, and `orderRepository` to build and inspect the paid order whose PII clock is asserted.
- **`@modules/products/tests/factories` (`createProduct`)** — supplies a product for the order line-item.
- **`@modules/users/services` (`userService`)** — the system under test; `minimiseInactiveBefore` is the method exercised.
- **`@modules/users/model` (`userModel`)** — used directly by `makeInactive` and `isMinimised` to manipulate/inspect the raw document.
- **`@modules/users/module` (`usersModule`)** — registered in the hook-failure test so the users module's own hook runs alongside the failing one.
- **`@modules/users/tests/factories` (`createUser`, `userRepository`)** — user creation fixture and read-back repository.

## Notes

- `createdAt` is treated as immutable by Mongoose; the test bypasses this with `{ overwriteImmutable: true }` to backdate the account. This is the only reason `makeInactive` uses a raw `updateOne` rather than a service method.
- The hook-failure test replaces the module registry mid-test (via `registerModules`) instead of using `registerCheckoutModules`, so it is the only test that does **not** go through the standard checkout wiring.
- The "boomerang" test manually sets `inactivityMinimisedAt` to an old date *and* sets a recent `lastActiveAt` to simulate a user who was minimised, reactivated, and then went quiet again—verifying that a second minimisation is permitted once the stamp is older than the new inactivity window.
