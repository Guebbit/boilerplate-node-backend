---
source: src/modules/returns/tests/contract/api.contract.test.ts
sha256: a6b9bb66de9bc44cf6e6325c1435b00b59b09ab84ac133a335fd531d9914d44b
generated_at: 2026-10-15T11:59:06.578791+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/contract/api.contract.test.ts

## Purpose

Contract tests for every `/returns` HTTP endpoint (create, list, get, approve, decline, receive). Each response is auto-validated against the API spec via the `@tests/contract` import, while the assertions pin the *behavioral* contracts: status codes, `Location` headers, side-effects (order cancellation, status transitions), and the specific 4xx error codes a client must handle. The file exists so that any change to the returns API shape or semantics fails here before it reaches consumers.

## Key elements

- **`customerWithOrder(status)`** – Creates a logged-in customer, a product, and an order in the given `OrderStatus`. For `shipped`/`delivered` it drives the order through the real delivery pipeline (`carryOrderTo`) so fulfillment records exist. Returns `{ bearer, orderId, productId }`.
- **`requested()`** – Creates a `defective` return on a delivered order plus a manager bearer, for the approve/decline suites.
- **`withdrawn()`** – Creates a `withdrawal` return on a delivered order plus a warehouse bearer, for the receive suite.
- **`describe('POST /returns', …)`** – Covers 201 + `Location` + `actions` shape for shipped and pre-dispatch withdrawals, the order-side effect (→ `cancelled`), 422 `RETURN_LINES_INVALID`, 422 for `no_answer`, 409 `RETURN_ORDER_NOT_RETURNABLE`, 404 for non-own order, 422 unknown field, and 401 without auth.
- **`describe('GET /returns and GET /returns/{id}', …)`** – List-by-order filter and single-fetch; 404 cross-tenant guard.
- **`describe('POST /returns/{id}/approve and /decline', …)`** – 200 decision, 409 `RETURN_NOT_DECIDABLE` on second decision, 422 missing decline reason, 403 for customer, 404 for unknown id.
- **`describe('POST /returns/{id}/receive', …)`** – 200 receipt (status → `closed`, `receivedAt` set), 409 `RETURN_NOT_RECEIVABLE` on double-receive.

## Relationships

- **`tests/support/contract.ts`** – Side-effect import (`@tests/contract`); intercepts every `api()` call and validates the response against the registered spec. All structural assertions are delegated here.
- **`tests/support/http.ts`** – Provides `api()` (supertest wrapper), `authenticateAs`, and `authenticateAsRole` used in every request.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` called at module top to provision a clean database.
- **`src/modules/products/tests/factories.ts`** – `createProduct` seeds the catalog item.
- **`src/modules/orders/tests/factories.ts`** – `createOrder` / `toOrderItem` build the order fixture.
- **`src/modules/delivery/tests/factories.ts`** – `carryOrderTo` advances an order through shipping/delivery so real fulfillment rows exist.
- **`src/modules/delivery/index.ts`** – `shipFulfillmentOrder` (imported; used in the truncated portion to drive a shipment before a return).
- **`src/types/index.ts`** – `OrderStatus` enum used by `customerWithOrder`.
- **`tests/support/callers.ts`** – `asAdmin` / `callerContextAs` (imported; used in the truncated portion for admin-scoped assertions).

## Notes

- The `@tests/contract` import is a **side-effect module**—there is no named export used. All spec validation is automatic; the file only asserts behavior that the spec cannot express (side-effects, ordering, specific error codes).
- `customerWithOrder` intentionally routes `shipped`/`delivered` through `carryOrderTo` rather than just setting a status, because the return logic depends on real fulfillment records existing.
- The withdrawal-before-dispatch test makes a **second HTTP call** to `GET /orders/{id}` to verify the order was cancelled—a cross-endpoint side-effect that a pure returns test would miss.
- The `actions` object is asserted to be all-`false` in customer-facing responses; this is a client-contract guarantee (no staff buttons rendered) and would break if the API ever leaked an action flag.
- The file is truncated in the source view; the `receive` suite and possibly admin/staff-scoped tests continue beyond what is shown here.
