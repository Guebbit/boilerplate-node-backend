---
source: src/modules/delivery/tests/integration/service.test.ts
sha256: 02d2ea959fbd1f0533055152d456f9faef39ae69084aeca56757b23d2f437940
generated_at: 2026-09-23T18:38:04.761960+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/integration/service.test.ts

## Purpose

Integration tests for the delivery service: the rate-pricing rules and the shipment→delivery lifecycle. Exercises `recordShipment`, `recordDelivery`, and `getForOrder` against a real MongoDB instance, asserting that order status transitions, parcel writes, and the outbound tracking email all happen in the expected combination (or are correctly refused).

## Key elements

- **`setupTestDb()`** (from `tests/support/setup-test-db`) — spins up a real Mongo instance for the whole file; called at module top level.
- **`jest.mock('@infrastructure/adapters/mailer')`** — replaces `enqueueEmail` with a jest mock so email side-effects are asserted rather than sent.
- **`processingOrderFor()`** — fixture that creates a user, a 10-unit product, and an order in `processing` status with no frozen shipping method.
- **`shippedOrderFor()`** — builds on the above, calls `recordShipment` with a fixed tracking code, and returns the now-shipped pair.
- **`describe('rates')`** — unit-level assertions on `findShippingMethod`, `priceShipping`, and `SHIPPING_METHODS` (free-at-threshold, no-threshold method never free, pickup as a valid method, unknown id → `undefined`, express is the sole tracked method).
- **`describe('recordShipment')`** — happy path (parcel written, order → `shipped`, email sent once with correct template/to/tracking), 409 on non-processing order, 422 missing tracking code for tracked method (and parcel NOT written), and untracked method shipping without a code.
- **`describe('recordDelivery')`** — stamps parcel `delivered` + sets `deliveredAt`, moves order to `delivered`; 409 if order not yet shipped or already delivered.
- **`describe('getForOrder')`** — owner gets the shipment; stranger and unshipped-order both resolve to 404 (indistinguishable absence).

## Relationships

| Neighbor | Interaction |
|---|---|
| `src/modules/delivery/service.ts` | System under test — `recordShipment`, `recordDelivery`, `getForOrder`. |
| `src/modules/delivery/domain/index.ts` | Provides `findShippingMethod`, `priceShipping`, `SHIPPING_METHODS` (rate logic). |
| `src/modules/delivery/domain/rates.ts` | Underlying rate constants/rules consumed via the domain barrel. |
| `src/modules/delivery/repository.ts` | `shipmentRepository` used to read back parcel state after service calls. |
| `src/modules/orders/index.ts` | `orderService.getById` used to verify order status transitions. |
| `src/infrastructure/adapters/mailer.ts` | `enqueueEmail` — mocked; assertions target its call args. |
| `src/modules/orders/tests/factories.ts` | `createOrder`, `toOrderItem` — order fixtures. |
| `src/modules/products/tests/factories.ts` | `createProduct` — product fixture. |
| `src/modules/users/tests/factories.ts` | `createUser` — user fixtures (owner, stranger). |
| `src/types/index.ts` | `OrderStatus` enum used in fixtures and assertions. |
| `tests/support/callers.ts` | `asCustomer`, `testCallerContext` — caller-context helpers. |
| `tests/support/response.ts` | `asReject` — type-narrowing helper for error responses. |
| `tests/support/setup-test-db.ts` | `setupTestDb` — real Mongo lifecycle. |

## Notes

- **Real DB, one mock.** Only the mailer is mocked; all persistence is against a live Mongo started by `setupTestDb()`. No other infrastructure is stubbed.
- **`setupTestDb()` runs at import time** (top-level `setupTestDb()` call), not inside `beforeAll`. This means the DB is up before any test file logic executes.
- **`getForOrder` 404 is overloaded.** A stranger's request and the owner's unshipped order both return 404 — the test explicitly documents that the parcel's absence is the same signal for both cases.
- **Email is a one-shot assertion.** `mockEnqueueEmail` is cleared per test; the happy-path test asserts exactly one call, the correct template (`delivery.shipment-shipped`), recipient, and that the tracking code appears in the payload.
- **Tracking-code rule is method-dependent.** `express` (the only `tracked` method) requires a code (422 without one); `standard` and `pickup` ship fine with `undefined`.
