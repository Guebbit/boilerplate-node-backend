---
source: src/modules/shop-tasks/tests/integration/work-summary.test.ts
sha256: 72b4b07ad792756c08da2983cb239b277f1ab49d6b9caf3f22431cc1ee18c2a5
generated_at: 2026-11-08T08:19:31.870544+00:00
model: ollama:qwen3.8:27b
---

# src/modules/shop-tasks/tests/integration/work-summary.test.ts

## Purpose
Integration test for the `GET /shop-tasks/summary` endpoint. It verifies that each summary count equals the total its corresponding list endpoint reports, that authorization restricts which keys a caller can see, that a shipped order decrements the count, and that empty categories are returned as explicit zeros rather than omitted keys.

## Key elements
- **`summaryFor(bearer)`** – helper that GETs `/shop-tasks/summary` with the given bearer token.
- **`listTotal(bearer, url)`** – helper that GETs a list endpoint and returns `body.meta.totalItems`, used to compute expected counts dynamically.
- **`orderIn(status, extras?)`** – creates a fresh unique buyer, a product, and an order in the given status (optionally with `deletedAt` or other fields).
- **`buyers`** – module-level counter ensuring each test gets a unique buyer email/username.
- **Six test cases** covering:
  - Admin sees all five keys and counts match the live list endpoints (orders, payments, returns, preorders, inventory).
  - A cash payment with a pending refund and a late preorder each register as `1`.
  - Empty state returns all five keys with value `0`.
  - Transitioning an order to `shipped` drops it from `salesOrders`.
  - A `warehouse` role receives only the keys its rules permit (`salesPayments` absent).
  - Unauthenticated request returns `401`.

## Relationships
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` initialises the test database before all tests.
- **`tests/support/http.ts`** – `api()`, `authenticateAs`, `authenticateAsRole` provide the HTTP client and auth helpers.
- **`tests/support/callers.ts`** – `asAdmin`, `callerContextAs` supply caller context for service-level calls.
- **`src/kernel/events.ts`** – `resetDomainEvents` in `afterEach` clears the event bus between tests.
- **`src/modules/users/tests/factories.ts`** – `createUser` creates the buyer.
- **`src/modules/products/tests/factories.ts`** – `createProduct` creates the item on the order.
- **`src/modules/orders/tests/factories.ts`** – `createOrder`, `toOrderItem`, `forceOrderStatus` build and mutate orders.
- **`src/modules/inventory/tests/factories.ts`** – `forceStockLevel` drives a product to zero stock for the inventory count.
- **`src/modules/returns/tests/factories.ts`** – `insertBareReturns` seeds a return request.
- **`src/modules/delivery/tests/factories.ts`** – `paidPreorderOrder`, `fulfillmentOrdersOf`, `setFulfillmentOrderState` build and age a late preorder.
- **`src/modules/payments/tests/factories.ts`** – `refundOrderPayment` creates a pending refund.
- **`src/modules/payments/index.ts`** – `paymentService.recordOfflinePayment` records a cash payment.
- **`src/types/index.ts`** – `OrderStatus` enum used to parameterise order creation and assertions.

## Notes
- The primary count test computes its expected values by **querying the live list endpoints** at assertion time, so it is a consistency contract (summary ≡ list totals) rather than a static expectation. The subsequent `toBe(2)` / `toBeGreaterThan(0)` guards confirm the seeded rows are actually present.
- The `buyers` counter is module-scoped (not reset per test), so email uniqueness persists across the whole suite run—intentional, since each order must belong to a distinct buyer to avoid address-sharing side effects.
- The role-based test asserts key *presence/absence*, not count values, making it a pure authorization check.
