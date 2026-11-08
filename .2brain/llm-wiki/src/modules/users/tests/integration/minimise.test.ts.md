---
source: src/modules/users/tests/integration/minimise.test.ts
sha256: 38792d222ed8f33b6cdb29d9104e22a9eba1ad33dd0d76c91dbf2b0b3db5bf64
generated_at: 2026-11-08T08:55:01.622971+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/minimise.test.ts

## Purpose

Integration test for the inactivity-minimisation feature. It exercises `userService.minimiseInactiveBefore` through **real module wiring** (address, users, and a fake failing module) against a real test database, verifying that an account quiet past the cutoff loses its address book, gets its orders' PII clock started, retains its login and orders, and is stamped so subsequent runs skip it.

## Key elements

- **`makeInactive(id, extra?)`** — Backdates a user's `createdAt` (via `overwriteImmutable`) and optionally sets extra fields like `active: false`.
- **`inactiveCustomerWithOrder(name)`** — Fixture builder: creates a customer, gives them an address, creates a paid order, and marks the account inactive.
- **`addressesOf` / `clockOf` / `isMinimised`** — Thin assertion helpers that read state back through the public service, order repository, and user model respectively.
- **`daysAgo(days)` / `LONG_AGO`** — Time helpers for the cutoff threshold (30 days) and a fixed "ancient" timestamp.
- **Six test cases** covering: happy-path minimise, banned account, idempotent rerun, active-account no-op, re-minimisation after re-activity ("boomerang"), and hook-failure leaving no stamp.

## Relationships

| Neighbor | Interaction |
|---|---|
| `@kernel/registry` | `registerModules` / `registerCheckoutModules` wire modules for each test; the "flaky" test injects a fake failing module. |
| `@kernel/events` | `resetDomainEvents()` in `afterEach` clears the event bus between tests. |
| `@modules/users/services` | `userService.minimiseInactiveBefore` is the system under test. |
| `@modules/users/module` | Registered as the users module in the module graph. |
| `@modules/users/model` | `userModel.updateOne` used directly to backdate fields; `userModel.exists` checks the minimised stamp. |
| `@modules/users/tests/factories` | `createUser`, `userRepository` for fixture creation and reload. |
| `@modules/addresses/*` | `addressesModule` registered; `giveAddress` fixture; `addressService.list` for assertions. |
| `@modules/orders/tests/factories` | `createOrder`, `toOrderItem`, `markOrderPaidAt`, `orderRepository` to build and inspect orders. |
| `@modules/products/tests/factories` | `createProduct` to create a product for the order line. |
| `@tests/checkout-modules` | `registerCheckoutModules` sets up the standard module set in `beforeEach`. |

## Notes

- `createdAt` is normally immutable on `userModel`; tests bypass this with `{ timestamps: false, overwriteImmutable: true }`.
- `setupTestDb()` runs once at module scope (not per-test), relying on the test framework's per-suite DB reset.
- The "boomerang" test manually overwrites `inactivityMinimisedAt` to an old date to simulate re-activity, since the service only skips accounts whose stamp is *after* the cutoff.
- The "flaky" test does **not** call `registerCheckoutModules`; it manually registers a failing module plus `usersModule` to isolate hook-failure behavior.
