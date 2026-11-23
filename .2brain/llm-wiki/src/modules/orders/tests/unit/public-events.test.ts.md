---
source: src/modules/orders/tests/unit/public-events.test.ts
source_sha256: 4c0cda869dbd0ae6f75d50f7183433a39b02866e2fd0904c48a5640ac6010e2f
context_sha256: 8f0b91d21e8a190bf588aa287c78066c62883762fa6aaab363689e5676e7a54f
generated_at: 2026-11-22T06:37:22.021648+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/tests/unit/public-events.test.ts

## Purpose
Unit tests for the orders module's public (webhook) events. They check the event name and payload that subscribers receive when the module's manifest projects a domain event through `toPublicEvent`. The file also checks that the AsyncAPI contract stays in sync with the code.

## Key elements
- **`ORDER_CREATED` test**: projects to `order.created` with `{ orderId }` only.
- **`ORDER_STATUS_CHANGED` test**: projects to `order.paid` when `to` is `'paid'`. Any other move, such as `'shipped'`, is expected to be `toBeUndefined`, so nothing is announced.
- **`ORDER_CANCELED` tests**:
  - Run with `it.each([true, false])` over `refund`.
  - Project to `order.canceled` with `{ orderId, cause }`.
  - Assert that `refund` is not in the payload. Whether money is owed is a `payments` policy, and `payment.refunded` is announced when money actually moves.
  - A separate case checks that `cause: 'lost'` is passed through, so subscribers don't assume stock was restocked.
- **Contract test**: parses `src/modules/orders/asyncapi.webhooks.yaml` (located via `MODULES_ROOT`) with `yaml`. It asserts that `OrderCanceledPayload.properties.cause.enum` equals `Object.keys(CANCEL_CAUSES)`.
- **`ORDER_REDACTED` test**: projects to `order.redacted` with `{ orderId }` only.

## Relationships
- `src/modules/orders/module.ts`: the default export `ordersModule` provides `publicEvents[...]`, whose `toPublicEvent` is the code under test.
- `src/modules/orders/events.ts`: provides the keys `ORDER_CREATED`, `ORDER_STATUS_CHANGED`, `ORDER_CANCELED` and `ORDER_REDACTED`, used to look up each projection.
- `src/modules/orders/services/cancel.ts`: provides `CANCEL_CAUSES`, the source of truth for the cause enum compared against the contract.
- `tests/support/paths.ts`: provides `MODULES_ROOT`, used to build the path to the module's contract file.
- `tests/support/stub.ts`: provides `asStub`, used to build partial event inputs.

## Notes
- Inputs are built with `asStub<never>(...)`. The projection slot takes `never` so one registry can hold every module's projections, so tests must cast.
- The AsyncAPI enum is a hand-maintained copy of the code's list, because no contract file can import it. The contract test is what catches drift between the two.
