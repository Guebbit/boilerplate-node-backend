---
source: src/modules/orders/tests/contract/api.contract.test.ts
sha256: d168bd53da34a03921788775fea957ae6e0b787575fef92bc4400b91e85d4550
generated_at: 2026-10-29T04:51:00.544642+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the `/orders` REST resource. They assert that live HTTP responses (list, detail, cancel) conform to the OpenAPI schema, that query filters behave as the published contract claims, and that role-scoped access (admin, moderator, user, operator) returns the correct shape without leaking data. The file exists because two prior bugs — a mismatched list-paginated `total` field and a per-role shape divergence on `GET /orders/{id}` — went uncaught by unit tests that never crossed the HTTP boundary.

## Key elements

- **`seedOrderFor(user, status?)`** – local helper that creates a product, then an order with one real line item; keeps seed data realistic without pulling in the invoicing download-scope suite.
- **`describe('GET /orders — the filters it now publishes')`** – verifies `status`, `userId`, batch `id` filters work, and that the deliberately-scalar `userId` still returns 422 when repeated.
- **`describe('GET /orders')`** – asserts 200 + contract shape for both unrestricted and scoped callers; pins the three-field totals (`totalItems`, `totalQuantity`, `totalPrice`) and the *absence* of a singular `total`; confirms `deleted=true` is inert for a customer scope.
- **`describe('GET /orders/{id}')`** – asserts contract conformance on both the unscoped (admin) and scoped (user) paths, and that a malformed ObjectId yields 404 (not 422) for each role independently.
- **`describe('POST /orders/{id}/cancel')`** – covers owner cancel, admin cross-user cancel, peer-admin cancel, reauth-window 401 for operators on stale sessions, absence of reauth prompt for the buyer, and 404 (no existence leak) for another user's order id.

## Relationships

- **`tests/support/contract.ts`** (imported side-effect) – registers the global contract-matching interceptor so every `api()` response is validated against `openapi.yaml` automatically.
- **`tests/support/http.ts`** – provides `api()` (supertest wrapper), `authenticateAs`, `authenticateAsRole`, and `loginBearer` used to obtain role-specific Bearer tokens.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` resets the test database before the suite runs.
- **`tests/support/clock.ts`** – `freezeDate` / `advanceDate` control the system clock to exercise the reauth window without real waiting.
- **`src/kernel/config.ts`** – `reauthWindowSeconds('critical')` determines how far to advance the clock for the stale-session test.
- **`src/modules/orders/tests/factories.ts`** – `createOrder` and `toOrderItem` build in-memory order fixtures.
- **`src/modules/products/tests/factories.ts`** – `createProduct` supplies a valid product for order line items.
- **`src/modules/users/tests/factories.ts`** – `createUser` provisions the callers (admin, moderator, user, peer).
- **`src/modules/orders/repository.ts`** – `orderRepository.updateStatusIfIn` transitions an order to `paid` (reaching a status only via the state machine); `orderRepository.findById` verifies the DB was not mutated after a failed (reauth-blocked) cancel.
- **`src/modules/orders/model.ts`** – `orderModel` imported (likely for type access or direct queries not visible in the truncated portion).
- **`src/modules/orders/services/index.ts`** – `orderService` imported (service-layer interaction, usage in truncated section).
- **`src/types/index.ts`** – `OrderStatus` enum type for the optional status parameter in `seedOrderFor`.

## Notes

- The file is intentionally *not* a unit test: every assertion goes through real HTTP via `api()`, so contract mismatches (field names, status codes, filter acceptability) are caught at the wire level.
- `orderService` and `orderModel` are imported but their direct usage falls in the truncated tail; the visible tests interact with the repository directly for state-transition and post-assertion checks.
- The reauth tests call `jest.useRealTimers()` *after* the `advanceDate` call — the pattern is freeze → advance → make request → restore, not a global timer mock.
- The `it.each` for malformed-id 404s exists because the `requireId` guard lives per-route (`get-order-item.ts`), not in shared middleware; a regression on one role's route would not be caught by the other.
- The moderator `userId` filter test is a regression pin: the scope is held by explicit name (`display:Order`), not a wildcard, so a scope-matching bug that silently dropped the filter would return all users' orders.
