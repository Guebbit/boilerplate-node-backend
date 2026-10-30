---
source: src/modules/orders/tests/integration/retention.test.ts
sha256: a6926206d902957b3612a394c98a20586a317b62d51a10c9c32b2da16f9456f6
generated_at: 2026-10-29T04:56:20.079617+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/retention.test.ts

## Purpose

Integration tests for the order PII retention lifecycle. The suite verifies two phases in sequence: (1) **detach** — when a user account is hard-deleted, the order's `userId` is unset and `piiClockStartedAt` is set, while the order document itself survives; and (2) **sweep** (`anonymizeDueOrders`) — once the retention window (governed by order status, `conformityUntil`, and configurable day-count env vars) elapses, all remaining PII (email, both addresses, notes) is scrubbed and a single `order.redacted` outbox event is emitted. Tests exercise the real module wiring (hooks registered via `registerCheckoutModules`) rather than calling service internals directly, so a missing hook declaration would be caught.

## Key elements

- **`redactedIds()`** – Queries the outbox for `order.redacted` rows and returns the sorted list of `aggregateId`s. Used to assert exactly-once event emission.
- **`eraseAndSweep(build, overrides?)`** – Composite helper: creates a user/product/order, optionally mutates the order via `build`, erases the user, calls `orderService.anonymizeDueOrders()`, reloads the order. Returns `{ scrubbed, order }`.
- **`describe("orders — detach on account erasure")`** – Four tests: hard-delete unsets `userId` + starts PII clock; order document persists; soft-delete (`removeById(…, false)`) leaves the order untouched; erasing one user does not affect another user's orders.
- **`describe("orders — the claim window decides when a paid order loses its buyer")`** – Retention-window semantics: never-paid orders scrub immediately; delivered orders respect `conformityUntil`; `NODE_ORDER_PII_DAYS_AFTER_GUARANTEE` extends the window; `NODE_ORDER_PII_DAYS_UNDELIVERED` governs paid-but-cancelled orders; in-transit statuses (paid/processing/shipped) are protected until delivered; full address objects (including `country`) are unset; `order.redacted` fires exactly once.
- **`describe("orders — anonymizeDueOrders (reap-orders sweep)")`** – Direct sweep assertions: email replaced with `anonymized@deleted.invalid`, both `shippingAddress`/`billingAddress` and `notes` nulled, `piiClockStartedAt` cleared; works when no addresses exist; scrubbed order still serializes (truncated).

## Relationships

- **`@modules/orders/tests/factories`** – Supplies `createOrder`, `toOrderItem`, `detachOrderUserId`, `forceOrderStatus`, `markOrderPaidAt`, `setConformityUntil` to build order fixtures in specific states.
- **`@modules/orders/services`** – Calls `orderService.anonymizeDueOrders()`, the function under test for the sweep phase.
- **`@modules/orders/repository`** – Uses `orderRepository.findById` to reload and assert order state after each operation.
- **`@modules/users/tests/factories`** – `createUser` and `eraseAsScheduled` drive the account-erasure side of the cascade.
- **`@modules/users`** – `userService.removeById` is called directly in the soft-delete test.
- **`@modules/products/tests/factories`** – `createProduct` provides the product needed for order items.
- **`@kernel/outbox`** – `outboxEventModel` is queried to verify `order.redacted` event emission.
- **`@kernel/events`** – `resetDomainEvents` in `afterEach` prevents cross-test event leakage.
- **`@tests/checkout-modules`** – `registerCheckoutModules` in `beforeEach` wires the real inter-module hooks (including the `personalData.erase → detachUserId` cascade).
- **`@tests/environment`** – `setEnvironment` injects `NODE_ORDER_PII_DAYS_AFTER_GUARANTEE` / `NODE_ORDER_PII_DAYS_UNDELIVERED` to control the retention window.
- **`@tests/callers`** – `callerContextAs('admin')` supplies the caller context for the `removeById` call.
- **`@types`** – `OrderStatus` enum values (cancelled, delivered, paid, processing, shipped) drive status-specific test cases.
- **`@infrastructure/persistence/versioning`** – `versionOf` imported (likely used in truncated assertions on document versioning).
- **`@modules/orders/model`** – `orderModel` imported (available for direct model-level assertions in truncated section).

## Notes

- The suite deliberately avoids calling the detach function directly; it triggers erasure through the user service so that a missing hook registration in `orders/module.ts` would cause test failures (mirrors the cart cascade suite's approach).
- `NODE_ORDER_PII_DAYS_AFTER_GUARANTEE` and `NODE_ORDER_PII_DAYS_UNDELIVERED` are set per-test via `setEnvironment`; they shift the effective retention deadline relative to `conformityUntil` or `paidAt` respectively.
- The `redactedIds` helper uses `.toSorted()` (non-mutating), so the outbox query result is not reordered in place.
- `resetDomainEvents()` runs in `afterEach` for the detach and claim-window suites but **not** in the `anonymizeDueOrders` suite (visible portion) — check whether that's intentional if adding tests there.
- The "scrubbed order still serializes" test (truncated) guards against the serializer expecting address fields to exist.
