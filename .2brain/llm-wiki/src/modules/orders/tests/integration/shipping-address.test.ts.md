---
source: src/modules/orders/tests/integration/shipping-address.test.ts
source_sha256: d91ca228f967b8cb1c8f3100b0200d15402f0dc1d88a2b8c2a93cf629f965f0e
context_sha256: b1b067fa8534b2c2c1ff34eae0d0ccaacea857bf40aa6165dc6a8e6a15cbfe72
generated_at: 2026-11-22T06:34:20.126120+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/tests/integration/shipping-address.test.ts

## Purpose
Integration tests for `PUT /orders/{id}/shipping-address`, the staff action that corrects where an order's unsent units ship. The suite checks that the new address is stored encrypted, that history and audit records say who acted but never include the address, that the correction stays available while units remain to send, and that unsupported countries are rejected.

## Key elements
- `BEFORE` / `AFTER` – fixture addresses. `AFTER` differs only in street and zip. Both use country `IT`.
- `seedPaidOrder(status?)` – creates a buyer via `authenticateAs('user')`, a product, and an order with `shippingAddress: BEFORE`. Defaults to `OrderStatus.paid`. Returns `{ order, buyer }`, where `buyer` is the bearer token.
- `jest.mock` of the audit port – replaces `@infrastructure/observability/audit` with `auditPortMock()`.
- `setupTestDb()` – sets up the test database.
- One `describe('PUT /orders/{id}/shipping-address')` block covering these cases:
  - **Replace and encrypt:** admin gets 200, and the raw Mongo document does not contain the new street. The staff timeline contains `address_corrected` but not the address text.
  - **Audit:** exactly one `ADMIN_ORDER_ADDRESS_CORRECTED` event is emitted, with `targetType: 'order'` and the order id as `targetId`. It does not contain the address.
  - **Buyer view:** the buyer sees the new address on the order, and the buyer's timeline has no `address_corrected` row.
  - **`actions.correctAddress`:** it is `true` for staff. Once `fulfillment.shipped` is true and `fulfillment.remaining` is 0, it is `false` and the PUT returns 409 `ORDER_ADDRESS_LOCKED`.
  - **Partly shipped:** with `remaining: 1` the PUT returns 200. After `remaining` is set to 0 it returns 409.
  - **Unsupported country:** `US` returns 422 `ORDER_SHIP_TO_COUNTRY_NOT_SUPPORTED`, and the stored address is unchanged.
  - **No address on the order:** 409.
  - **Authorization and lookup:** a buyer gets 403 and an unknown order id gets 404.
  - **Validation:** an incomplete address or an empty `street` returns 422.

## Relationships
- `@tests/setup-test-db`, `@tests/http` (`api`, `authenticateAs`, `authenticateAsRole`) and `@tests/ports` (`observePort`, `auditPortMock`) provide the DB lifecycle, HTTP client and auth helpers, and the audit-port spy/mock.
- `@infrastructure/observability/audit` is mocked, and `emitAuditEvent` is observed through `observePort`.
- `../../audit` (`src/modules/orders/audit.ts`) supplies `ordersAuditActions`, whose `ADMIN_ORDER_ADDRESS_CORRECTED` action is used to filter audit calls.
- `../../model` supplies `orderModel`. The tests use it for raw collection reads (to check encryption) and for `updateOne` calls that set the fulfillment state.
- `@modules/orders/tests/factories` (`createOrder`, `toOrderItem`) and `@modules/products/tests/factories` (`createProduct`) seed the data.
- `@types` supplies `OrderStatus`.

## Notes
- The tests mutate `fulfillment.shipped` and `fulfillment.remaining` directly on the model. They do not ship through the API.
- The doc comment on `AFTER` repeats the one on `BEFORE` ("The address the order is placed with"). `AFTER` is actually the corrected address.
