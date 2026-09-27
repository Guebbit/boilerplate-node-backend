---
source: src/modules/delivery/tests/integration/service.test.ts
sha256: cd6ba17a34364bdddcdc026e4e799fa9bcf149df911e79967318fb24ee445eda
generated_at: 2026-09-27T14:51:56.605128+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/integration/service.test.ts

## Purpose
Integration tests for the delivery module covering two concerns: the rates domain (pricing rules and method metadata) and the shipment lifecycle service (`recordShipment`, `recordDelivery`, `getForOrder`). Runs against a real Mongo instance (`setupTestDb`) so that repository writes and cross-module order-status transitions are exercised end-to-end; only the mailer and (in one case) the logger are mocked.

## Key elements
- **`processingOrderFor()` / `shippedOrderFor()`** — local fixture helpers that build a user → product → order chain and optionally ship it, returning the objects needed by each test.
- **`describe('rates')`** — unit-level assertions on `findShippingMethod`, `priceShipping`, and `SHIPPING_METHODS` (threshold logic, free-pickup, tracked-flag uniqueness, unknown-id → `undefined`).
- **`describe('recordShipment')`** — verifies the success path (parcel written, order moved to `shipped`, one `enqueueEmail` call with correct template/tracking), the buyer-lookup-failure fallback (email still sent, `logger.error` called), the `ORDER_NOT_PROCESSING` guard (409), and the `DELIVERY_TRACKING_CODE_REQUIRED` guard for tracked methods (422, no parcel persisted).
- **`describe('recordDelivery')`** — verifies the `shipped → delivered` transition (parcel stamped, `deliveredAt` set, order moved), the `ORDER_NOT_SHIPPED` guard, and idempotency (second call → 409).
- **`describe('getForOrder')`** — asserts owner access, stranger denial (404), and that an unshipped order also yields 404 (parcel absence, not authorization failure).
- **Mocks / spies** — `enqueueEmail` is globally mocked via `jest.mock`; `logger.error` is spied per-test; `userService.getById` is spied once to simulate a lookup failure. All restored in `afterEach`.

## Relationships
- **`src/modules/delivery/service.ts`** — the system under test; `recordShipment`, `recordDelivery`, `getForOrder` are the functions under verification.
- **`src/modules/delivery/domain/index.ts` / `rates.ts`** — `findShippingMethod`, `priceShipping`, `SHIPPING_METHODS` are imported and asserted directly in the rates block.
- **`src/modules/delivery/repository.ts`** — `shipmentRepository.findByOrderId` is used to confirm persisted parcel state after each service call.
- **`src/modules/orders/index.ts` / `services/index.ts`** — `orderService.getById` is called to verify that the order status actually transitioned in the database.
- **`src/modules/orders/tests/factories.ts`** — `createOrder`, `toOrderItem` build the order fixtures.
- **`src/modules/products/tests/factories.ts`** — `createProduct` supplies line-item pricing for threshold tests.
- **`src/modules/users/index.ts` / `service.ts`** — `userService.getById` is spied in the fallback-name test to force a rejection.
- **`src/modules/users/tests/factories.ts`** — `createUser` creates the buyer and the "stranger" identity.
- **`src/infrastructure/adapters/mailer.ts`** — `enqueueEmail` is the sole mocked I/O; every email assertion reads from `mockEnqueueEmail.mock.calls`.
- **`src/infrastructure/adapters/logger.ts`** — `logger.error` is spied to confirm the fallback-name code path logs the expected message and `orderId`.
- **`src/types/index.ts`** — `OrderStatus` enum used in fixtures and assertions.
- **`tests/support/callers.ts`** — `testCallerContext` (service calls) and `asCustomer` (query calls) provide the caller identity parameter.

## Notes
- Tests use **real Mongo** (`setupTestDb`), so they are true integration tests, not unit tests of the service in isolation.
- The mailer is the **only** external dependency mocked; the logger is spied on (not globally mocked), meaning other log calls still reach the real logger.
- `afterEach(() => jest.restoreAllMocks())` ensures per-test spies (logger, userService) do not leak, but the global `jest.mock` for the mailer persists for the whole file.
- The file mixes **domain-level** assertions (rates block, no DB needed) and **service-level** integration assertions in a single file — the rates tests will pass without Mongo, but the file still calls `setupTestDb()` unconditionally.
- Error responses are asserted via the shared `asReject` helper (from `@tests/response`), which expects `{ status, errors[] }` shape rather than thrown exceptions.
