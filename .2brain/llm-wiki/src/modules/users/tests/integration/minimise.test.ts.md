---
source: src/modules/users/tests/integration/minimise.test.ts
sha256: 64340aa349d779076bfe2a095b44d522b536852d4d93212bd8861cbcece52ba7
generated_at: 2026-11-14T22:35:16.471927+00:00
model: ollama:qwen3.8:27b
---

# src/modules/users/tests/integration/minimise.test.ts

## Purpose

Integration test for the inactivity-minimisation feature. It verifies, through real module wiring (no service-level mocks), that an account quiet past the cutoff loses its address book, has its orders' PII clock started, retains its login and orders, and is stamped with `inactivityMinimisedAt` so a subsequent run is a no-op.

## Key elements

- **`inactiveCustomerWithOrder(name)`** – Factory helper: creates a customer with one address and one paid order, then backdates the account to make it inactive.
- **`makeInactive(id, extra?)`** – Backdates `createdAt` (via `overwriteImmutable`) to simulate inactivity; optionally sets extra fields like `active: false`.
- **`addressesOf(userId)`** / **`clockOf(orderId)`** / **`isMinimised(userId)`** – Thin assertion helpers wrapping the address service, order repository, and a direct `userModel.exists` query.
- **`LONG_AGO` / `daysAgo(n)`** – Date constants/helpers for the 30-day cutoff used in every test.
- **Six `it` blocks** covering: happy-path minimisation, banned-account minimisation, idempotent rerun, active-account no-op, re-minimisation after a boomerang (reactivate → quiet again), and hook-failure (no stamp written, retry possible next run).

## Relationships

- **`src/modules/users/friends/account.ts`** – The system under test; the test imports the user service from here and invokes its minimisation entry point.
- **`src/modules/users/module.ts`** – Imported as `usersModule` and registered in the hook-failure test to participate in the domain-event fan-out.
- **`src/modules/users/model.ts`** – `userModel` used directly for backdating (`makeInactive`) and for asserting the `inactivityMinimisedAt` stamp.
- **`src/modules/users/tests/factories.ts`** – Provides `createUser` and `userRepository` for setup and assertions.
- **`src/modules/addresses/index.ts`** – `addressService` is imported from here; the test uses it to confirm the address book has been cleared.
- **`src/modules/addresses/module.ts`** – Registered via `registerCheckoutModules` in `beforeEach` so the address hook is active during minimisation.
- **`src/modules/addresses/tests/factories.ts`** – `giveAddress` populates the address book under test.
- **`src/modules/orders/tests/factories.ts`** – `createOrder`, `toOrderItem`, `markOrderPaidAt` build the order fixture; `orderRepository` is re-exported here and used for PII-clock assertions.
- **`src/modules/orders/repository.ts`** – The underlying order store; the test reads order state through it (via the factories re-export) to verify the PII clock and user linkage.
- **`src/modules/products/tests/factories.ts`** – `createProduct` supplies the item for the order.
- **`src/kernel/registry.ts`** – `registerModules` used in the hook-failure test to inject a module whose `minimise` hook rejects.
- **`src/kernel/events.ts`** – `resetDomainEvents` in `afterEach` to prevent cross-test event leakage.
- **`tests/support/checkout-modules.ts`** – `registerCheckoutModules` sets up the standard module set before each test.

## Notes

- `setupTestDb()` runs once at module load (not per-test), so the Mongo instance is shared across all `it` blocks; test isolation relies on unique usernames/emails.
- The `makeInactive` helper must use `overwriteImmutable: true` because Mongoose marks `createdAt` as immutable by default—this is intentional and flagged in the inline comment.
- The "boomerang" test manually overwrites `inactivityMinimisedAt` to 200 days ago to simulate that the account was active *after* the first minimisation; without this, the no-op guard would prevent re-minimisation.
- The hook-failure test registers a *custom* module (not one of the production modules) whose `minimise` rejects, verifying that the `inactivityMinimisedAt` stamp is only written after all hooks succeed.
