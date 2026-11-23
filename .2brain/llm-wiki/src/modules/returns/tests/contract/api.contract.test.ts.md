---
source: src/modules/returns/tests/contract/api.contract.test.ts
source_sha256: 40f097939d0905ad959f4c1da5ce1a18100d6d72a8de0642519954ab5703b210
context_sha256: a188bb056f96bc53d34fff42af5c902a71bcf64ee9bf16d1c1b80c3bc51f5ce4
generated_at: 2026-11-22T07:33:02.230971+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/tests/contract/api.contract.test.ts

## Purpose
Contract tests for the `/returns` API over real HTTP. Importing `@tests/contract` makes every response get checked against the API spec automatically. The tests check that each contract branch is reached: the 201 with its `Location` header, a withdrawal before dispatch (which produces a closed return), staff decisions, and the refusals a client has to handle.

## Key elements
- `setupTestDb()`: sets up the test database for the suite.
- `customerWithOrder(status)`: logs in a customer and creates a product (price `20.00`) and an order of 2 units in the given `OrderStatus`. For `shipped` or `delivered`, the order is created as `processing` and then moved with `carryOrderTo`, so real shipments exist. It returns `{ bearer, orderId, productId }`.
- `staffUser(role)`: creates a verified staff user with a unique email, using a module-level counter. The session of this user can be aged in tests.
- `requested()`: creates a `requested` return on a delivered order. It returns the customer bearer, a manager bearer, and the return id.
- `describe('POST /returns')`: covers these cases.
  - A withdrawal on shipped goods gives 201, `Location: /returns/{id}`, status `approved`, and every `actions` flag false.
  - A withdrawal on a paid order gives 201 with a return that is `closed`, has `lines: []`, and cancels the order (order status `canceled`, `actions.withdraw` false).
  - The withdrawal then shows up in `GET /returns?orderId=`.
  - 422 `RETURN_LINES_INVALID` when more units are requested than the order held.
  - 422 for an unknown reason, and 422 for an unknown body field.
  - 409 `RETURN_ORDER_NOT_RETURNABLE` for a canceled order.
  - 404 for an order that belongs to another customer.
- `describe('GET /returns and GET /returns/{id}')`: covers these cases.
  - The caller lists their own returns and fetches one by id.
  - List items carry the table fields and `actions` but never `note`, `declineMessage`, `lines` or `returnPostage`. Staff see the same item shape.
  - A comma-separated `sort` (`-createdAt,status`) works, and a field outside the enum (`note`) gets 422.
  - 404 for a return on someone else's order.
- `describe('POST /returns/{id}/approve and /decline')`: covers these cases.
  - Approve gives 200, and a second decision gives 409 `RETURN_NOT_DECIDABLE`.
  - Decline with a reason gives 200 and stores `declineReason` and `declineMessage`.
  - Decline without a reason gives 422.
  - Further cases follow in the rest of the file.

## Relationships
- `@tests/contract` (`tests/support/contract.ts`): imported for its side effect, which validates all responses against the spec.
- `tests/support/http.ts`: provides `api`, `authenticateAs`, `authenticateAsRole`, `loginBearer` and `staleBearerFor`.
- `tests/support/setup-test-db.ts`: provides `setupTestDb`.
- `tests/support/callers.ts`: provides `asAdmin` and `callerContextAs`.
- Factories: `users/tests/factories` (`createUser`), `products/tests/factories` (`createProduct`), `orders/tests/factories` (`createOrder`, `toOrderItem`) and `delivery/tests/factories` (`carryOrderTo`, `fulfillmentOrdersOf`).
- `@modules/delivery` (`deliveryService`) and `returns/repository` (`returnRepository`) are imported for use in the part of the file beyond this excerpt.
- `@modules/users` supplies the `UserDocument` type.
- `@types` supplies `OrderStatus`.

## Notes
- Tests exercise the API through HTTP (`api()`) with `Authorization` bearer headers. Customer and staff roles are obtained through `authenticateAs` and `authenticateAsRole`.
- A return on goods not yet dispatched is closed at creation and cancels the order. A return on shipped or delivered goods starts `approved` or `requested`, depending on the case.
