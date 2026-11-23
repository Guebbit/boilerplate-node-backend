---
source: src/modules/orders/tests/contract/api.contract.test.ts
source_sha256: c8cd40ec24243ae9973b45951ff3c5acf7bca3a70a9c9fd946d878d464acc9f7
context_sha256: 09e2db2397c5a2b3b79a5839c486bbba0b3ee69937215150237e9489e55b688f
generated_at: 2026-11-22T06:24:57.932633+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/tests/contract/api.contract.test.ts

## Purpose
HTTP-level contract tests for the `/orders` resource. The suite exists because the list endpoint once returned `totalItems`/`totalQuantity`/`totalPrice` while `openapi.yaml` required a single `total`, and `GET /orders/{id}` returned a different shape per caller role. Neither was caught because no test crossed HTTP. Both role branches of `getById` are asserted for that reason.

## Key elements
- `seedOrderFor(user, status?)` — helper that creates a product and an order with one line (quantity 2), optionally with a given status.
- `describe('GET /orders — the filters it now publishes')`:
  - `status` narrows the list. The paid order is reached through `orderRepository.updateStatusIfIn`, not by writing the column.
  - A moderator's `userId` filter is honoured, not just an admin's.
  - `id` works as a batch filter, while a repeated `userId` still returns 422 because it stayed scalar.
- `describe('GET /orders')`:
  - Unrestricted (admin) and scoped (user) callers get 200. The scoped caller sees only their own orders and `meta.totalItems` is 1.
  - `deleted=true` is ignored for a customer and returns an empty list.
  - List items carry `id`, `totalPrice` and `actions`, and omit `email`, `userId`, `items`, `shippingAddress`, `billingAddress` and `notes`.
  - A customer's list has the same shape and includes `orderNumber`.
  - The single-order read keeps `totalItems`, `totalQuantity` and `email`.
- `describe('GET /orders/{id}')`:
  - Both the unscoped (admin) and scoped (user) paths return 200.
  - A malformed id returns 404 for both roles, via `it.each` over `admin` and `user`.
- `describe('POST /orders/{id}/cancel')`:
  - An owner (`user`) can cancel their own pending order, with status `canceled`.
  - An admin can cancel someone else's pending order.
  - An admin can cancel an equal's (admin) order.
  - An operator on a stale session gets 401 `REAUTH_REQUIRED` and nothing is cancelled. This test is cut off in the visible content, and the file continues beyond that point.

## Relationships
- Test support:
  - `tests/support/contract.ts` (side-effect import via `@tests/contract`).
  - `setupTestDb()` from `tests/support/setup-test-db.ts`.
  - `api`, `authenticateAs`, `authenticateAsRole` and `loginBearer` from `tests/support/http.ts`.
  - `freezeDate` and `advanceDate` from `tests/support/clock.ts`.
- Factories: `createProduct` (`src/modules/products/tests/factories.ts`), `createOrder` and `toOrderItem` (`src/modules/orders/tests/factories.ts`) and `createUser` (`src/modules/users/tests/factories.ts`), used to seed data.
- `orderRepository` (`src/modules/orders/repository.ts`): `updateStatusIfIn` moves an order to `paid`.
- `orderModel` and `orderEventModel` (`src/modules/orders/model.ts`), `toObjectId` (`src/infrastructure/persistence/create-repository.ts`), `markPaid` (`src/modules/orders/friends/payments.ts`), `OrderStatus` (`src/types/index.ts`) and `reauthWindowSeconds` (`src/kernel/config.ts`) are imported. The visible portion does not show how they are used.
- `src/modules/orders/services/status.ts` is a graph neighbor, but the visible portion shows no direct import of it.

## Notes
- Contract suite for the orders routes; `@tests/contract` is imported for its side effects.
- Invoicing's download-scope tests belong to that module, so orders are seeded here with real lines but nothing is asserted about downloads.
- Scope is proven by absence: tests add another user's order to the same collection and assert it does not appear.
- The malformed-id 404 relies on `requireId`, which stops a `BSONError` from becoming a 422. The comment points to `get-order.ts`.
- The operator cancel route asks for a fresh session, while the customer's own cancel is never prompted.
