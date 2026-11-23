---
source: src/modules/returns/tests/integration/order-actions-parity.test.ts
source_sha256: 16b14806df72471c3ca5f2e1ad11dd465ffa59b41d510c67b868bb1818dbba28
context_sha256: 43104839891fd0f1befd166121d8f0cada95cc1476df03a828ff85925ba95555
generated_at: 2026-11-22T07:34:51.727830+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/returns/tests/integration/order-actions-parity.test.ts

## Purpose
An integration test that checks the `OrderActions` capability flags returned by `GET /orders/:id` match what the real HTTP endpoints accept. For every role × order status × act, a flag should be `true` exactly when the matching request succeeds (2xx). This prevents the client showing a button that fails, or hiding one that would work. It runs against the real app and a test database.

## Key elements
- `ROLES` / `STATUSES`: the swept sets. Roles are `customer` (the order's owner), `admin`, `manager`, `warehouse` and `support`. Statuses are every `OrderStatus`: pending, paid, processing, shipped, delivered and canceled.
- `OrderKind`: `'ordinary' | 'mixed' | 'bespoke-only'`. Mixed orders contain a made-to-order line, a product created with `noWithdrawal: true`. Bespoke-only orders contain only such lines.
- `signedIn()`: authenticates every role and returns the owner, the buyer `Caller` and all callers. Staff do not own the order.
- `orderIn(owner, status, kind)`: creates a fresh order in the given status.
  - `shipped` and `delivered` orders are created as `processing`, then moved with `carryOrderTo`.
  - `paid` and `processing` orders get their fulfillment orders via `fulfillmentOrdersOf`.
- `actionsFor(caller, orderId)`: fetches `GET /orders/:id` and returns `body.actions`, or `undefined` if the response is not 200.
- `whyBlocked(caller, orderId)`: returns `actions.withdrawBlocked`.
- `Act` / `ACTS`: each act pairs a flag reader with a request-sending "door". The acts are:
  - `cancel`
  - `process`
  - `withdraw` (`POST /returns`)
  - `pay` (`POST /payments`)
  - `delete` (`DELETE /orders/:id`)
  - `hardDelete` (`DELETE /orders/:id` with `?hardDelete=true`)
  - `recordPayment` (`POST /orders/:id/payments`)
- `accepted()`: true for any 2xx status.
- Test cases in `describe('the button and its door agree')`:
  - One `it.each` over `ACTS`, sweeping every role and status.
  - An override sweep over role × status × destination, using `overrideStatus` and `POST /orders/:id/override-status`.
  - A withdraw sweep for the buyer over order kind × status (pending, paid, processing).
  - A check that `withdrawBlocked` is `'all_excluded'` for the buyer on a bespoke-only paid order, `undefined` for the buyer on a canceled order, and `undefined` for all four staff roles on the bespoke-only order.

## Relationships
- `setup-test-db` (`setupTestDb`): sets up the test database.
- `checkout-modules` (`registerCheckoutModules`): in `beforeEach`, registers `paymentsModule` (`src/modules/payments/module.ts`) and `returnsModule` (`src/modules/returns/module.ts`).
- `http` (`api`, `authenticateAsRole`): HTTP client for the app and role-based sign-in.
- Product factories (`createProduct`), order factories (`createOrder`, `forceOrderStatus`, `toOrderItem`) and delivery factories (`carryOrderTo`, `fulfillmentOrdersOf`): build the test data.
- `src/types/index.ts`: supplies `OrderStatus` and the `OrderActions` type.

## Notes
- Each case builds its own order, because the endpoints write.
- Each sweep also asserts `bothOpen > 0`. Without it, a sweep where flag and door both always say no would pass trivially.
- A known edge is deliberately not swept: a mixed `processing` order whose eligible groups are already canceled keeps its withdraw button, and a second withdrawal returns 409 `RETURN_NOTHING_TO_CANCEL`.
