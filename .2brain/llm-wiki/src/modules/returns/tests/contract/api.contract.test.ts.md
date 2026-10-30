---
source: src/modules/returns/tests/contract/api.contract.test.ts
sha256: 14df0b863d7cd2c4252edd55663e07821d20b48e48cd9d372f41d967e839810d
generated_at: 2026-10-29T05:45:43.148950+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the `/returns` HTTP surface. Every response is validated against the shared API spec via `@tests/contract`, and each test pins a specific contract branch: the 201 + `Location` header on creation, the withdrawal-before-dispatch shortcut that yields a closed return, staff approve/decline/receive/close decisions, and the refusal codes a client must handle (422, 409, 404). The file exists so that any regression in status codes, body shape, headers, or error payloads is caught against the spec rather than by ad-hoc assertions alone.

## Key elements

- **`customerWithOrder(status)`** – Helper that logs in a customer, creates a product + order in the given `OrderStatus`, and (for `shipped`/`delivered`) runs the real delivery pipeline via `carryOrderTo` so shipments exist. Returns `{ bearer, orderId, productId }`.
- **`staffUser(role)`** – Creates a staff/manager account with a verified address; uses a module-level counter to guarantee unique emails across calls.
- **`requested()`** – Creates a customer return in `requested` state plus a manager bearer, returning both handles for decision-endpoint tests.
- **`withdrawn()`** – (truncated) Creates a withdrawal on a delivered order and a warehouse account for receive/close tests.
- **`describe('POST /returns')`** – Covers creation: withdrawal on shipped (approved), withdrawal before dispatch (closed + order cancelled), order listing, 422 for excess units / invalid reason / unknown body field, 409 for cancelled order, 404 for another user's order.
- **`describe('GET /returns and GET /returns/{id}')`** – Covers listing with `orderId` filter, fetching by id, comma-separated sort with enum validation, and 404 for cross-tenant access.
- **`describe('POST /returns/{id}/approve and /decline')`** – Covers approve (200), double-decision (409 `RETURN_NOT_DECIDABLE`), decline with reason code + message, missing reason (422), free-text instead of code (422), `other` without message (422), and 404 for nonexistent id.
- **Additional describe blocks** (truncated) – Cover receive, close, and cancel endpoints for warehouse/staff actions.

## Relationships

- **`tests/support/contract.ts`** – Side-effect import (`@tests/contract`) that hooks into the test runner to auto-assert every HTTP response against the spec. This is the primary reason the file exists.
- **`tests/support/http.ts`** – Provides `api()`, `authenticateAs`, `authenticateAsRole`, `loginBearer`, `staleBearerFor` for building authenticated requests over real HTTP.
- **`tests/support/setup-test-db.ts`** – Called once (`setupTestDb()`) to provision a clean database before the suite runs.
- **`tests/support/callers.ts`** – Provides `asAdmin` and `callerContextAs` for impersonation in staff/warehouse tests.
- **`src/modules/returns/repository.ts`** – Imports `returnRepository`, used (in truncated sections) to assert post-condition state beyond the HTTP response.
- **`src/modules/delivery/index.ts`** / **`src/modules/delivery/services/index.ts`** – Imports `deliveryService`; likely used in truncated sections to drive shipment state for receive/close tests.
- **`src/modules/delivery/tests/factories.ts`** – `carryOrderTo` and `fulfillmentOrdersOf` build real delivery records so shipped/delivered fixtures are coherent.
- **`src/modules/orders/tests/factories.ts`** – `createOrder` and `toOrderItem` build the order fixture the customer is acting on.
- **`src/modules/products/tests/factories.ts`** – `createProduct` creates the SKU referenced in order lines.
- **`src/modules/users/tests/factories.ts`** / **`src/modules/users/index.ts`** / **`src/modules/users/model.ts`** – `createUser` builds customer and staff accounts; `UserDocument` type used for typing.
- **`src/types/index.ts`** – `OrderStatus` enum drives the `customerWithOrder` helper's branching logic.

## Notes

- The `@tests/contract` import is a **side-effect registration**; it intercepts every `api()` call and validates the response against the OpenAPI/contract spec automatically. Individual `expect(...)` calls in the tests are supplementary (pinning *which* branch was hit), not the primary assertion mechanism.
- `customerWithOrder` has a subtle split: for `shipped`/`delivered` it creates the order as `processing` first, then calls `carryOrderTo` to advance it through the real delivery pipeline. This ensures shipments and fulfillment records exist, which downstream endpoints (receive, close) depend on.
- `staffUser` uses a module-scoped counter (`staffAccounts`) to guarantee unique emails. If tests run in parallel within the same process, this is the only deduplication mechanism.
- The file is truncated in the snapshot; the full suite includes additional describe blocks (likely `/receive`, `/close`, `/cancel`) that are not visible here. The wiki should be updated if those sections change.
