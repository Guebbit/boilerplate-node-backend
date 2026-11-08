---
source: src/modules/orders/tests/integration/retention.test.ts
sha256: 901aa79865a456aefa07cbdb4e840c1aac58043f44565254a6f58fbd2b0b9330
generated_at: 2026-11-08T07:08:58.140947+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/integration/retention.test.ts

## Purpose

Integration tests for the order PII retention pipeline: the two-phase erasure flow where a hard account delete first detaches `userId` (starting the PII clock), and a later `anonymizeDueOrders` sweep scrubs the remaining personal data (email, addresses, notes) once the retention window for that order's status has elapsed. Tests run against a real test database with full module wiring to prove the `personalData.erase → detachUserId` hook is actually declared in the order module, not just the service function.

## Key elements

- **`redactedIds()`** – queries the outbox for all `order.redacted` events and returns their sorted `aggregateId` list; used to assert exactly-one event per scrub.
- **`eraseAndSweep(build, overrides)`** – composite helper: creates user + product + order, invokes an optional `build` step, runs `eraseAsScheduled`, calls `orderService.anonymizeDueOrders()`, and returns both the scrub count and the reloaded order.
- **`describe('orders — detach on account erasure')`** – verifies hard-delete unsets `userId` and sets `piiClockStartedAt`; confirms the order document itself survives; confirms soft-delete does *not* trigger detach; confirms isolation across unrelated accounts.
- **`describe('orders — the claim window decides when a paid order loses its buyer')`** – exercises retention-window logic per order status (never-paid, canceled, delivered with `conformityUntil`, `NODE_ORDER_PII_DAYS_AFTER_GUARANTEE` grace period, `NODE_ORDER_PII_DAYS_UNDELIVERED` for paid-undelivered, and in-flight statuses `paid`/`processing`/`shipped`). Also verifies address fields (including `country`) are unset and `order.redacted` is emitted exactly once.
- **`describe('orders — anonymizeDueOrders (reap-orders sweep)')`** – asserts the sweep scrubs email to `anonymized@deleted.invalid`, removes both shipping and billing addresses and `notes`, clears `piiClockStartedAt`; confirms a scrubbed order still serializes without conjuring missing fields.

## Relationships

- **`src/modules/orders/services/index.ts`** – calls `orderService.anonymizeDueOrders()` to trigger the retention sweep under test.
- **`src/modules/orders/tests/factories.ts`** – provides `createOrder`, `toOrderItem`, `detachOrderUserId`, `forceOrderStatus`, `markOrderPaidAt`, `setConformityUntil` for building and manipulating test fixtures.
- **`src/modules/users/tests/factories.ts`** – provides `createUser` and `eraseAsScheduled` (the hard-delete + scheduled-erasure entry point).
- **`src/modules/products/tests/factories.ts`** – provides `createProduct` for order line items.
- **`src/modules/orders/repository.ts`** – `orderRepository.findById` is the assertion surface for verifying persisted state after each phase.
- **`src/modules/users/index.ts`** – `userService.removeById(user.id, false, …)` exercises the soft-delete path that must *not* detach.
- **`src/kernel/outbox.ts`** – `outboxEventModel` queried to confirm `order.redacted` domain events are emitted.
- **`src/kernel/events.ts`** – `resetDomainEvents()` clears in-memory event state between tests.
- **`tests/support/checkout-modules.ts`** – `registerCheckoutModules()` wires the `personalData.erase` hook into the order module so the cascade is proven end-to-end.
- **`tests/support/callers.ts`** – `callerContextAs('admin')` supplies the auth context for the soft-delete call.
- **`tests/support/environment.ts`** – `setEnvironment` overrides `NODE_ORDER_PII_DAYS_AFTER_GUARANTEE` / `NODE_ORDER_PII_DAYS_UNDELIVERED` to shift retention windows.
- **`src/modules/orders/model.ts`** – `orderModel` imported (used in truncated section, likely for serialization or direct-document assertions).
- **`src/infrastructure/persistence/versioning.ts`** – `versionOf` imported (used in truncated section, likely for version-invariant checks).
- **`src/types/index.ts`** – `OrderStatus` enum values used to set order state.

## Notes

- Tests deliberately go through real module wiring (`registerCheckoutModules`) rather than calling the detach function directly; a missing hook declaration in `orders/module.ts` would cause these tests to fail even if the service logic is correct.
- `setupTestDb()` runs once at module load; `resetDomainEvents()` runs after every test to prevent cross-test event leakage.
- Retention windows are driven by environment variables (`NODE_ORDER_PII_DAYS_AFTER_GUARANTEE`, `NODE_ORDER_PII_DAYS_UNDELIVERED`); tests set them via `setEnvironment` and rely on `conformityUntil` / `paidAt` relative to `Date.now()`.
- The order document is expected to *survive* erasure — only PII fields are scrubbed; the sale record (items, totals, status) remains intact.
- The `DAY` constant is local; all time offsets in the file are expressed as multiples of it.
