---
source: src/modules/returns/tests/contract/api.contract.test.ts
sha256: 04fe35127b72057908961c73864f2dabc9a7eb550d2d5658d5a7cf4c5844f80b
generated_at: 2026-11-08T08:07:03.714218+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/contract/api.contract.test.ts

## Purpose

Contract tests that exercise every `/returns` HTTP endpoint over a real HTTP layer (supertest) and, via the side-effect import of `@tests/contract`, automatically validate each response body and status against the OpenAPI spec. The file also pins that each major contract branch is actually reached: the `201` + `Location` header, a pre-dispatch withdrawal that lands as a closed return, staff approve/decline decisions, and every documented refusal (422, 409, 404).

## Key elements

- **`customerWithOrder(status)`** – creates a logged-in customer, a product, and an order in the given `OrderStatus`. If the status is `shipped`/`delivered`, the order is first created as `processing` then carried forward via `carryOrderTo` so that real shipments exist.
- **`staffUser(role)`** – creates a verified staff account with a unique email (incremented counter) for manager/warehouse-role tests.
- **`requested()`** – creates a `defective` return on a delivered order and returns a manager bearer token alongside the return id.
- **`withdrawn()`** – creates a `withdrawal` return on a delivered order and returns a warehouse bearer token (file truncated).
- **`describe('POST /returns')`** – 8 cases covering: shipped-withdrawal (201, Location, born-approved), pre-dispatch withdrawal (201, born-closed, order canceled), listing the withdrawal on the order, over-quantity 422, invalid reason 422, canceled-order 409, foreign-order 404, unknown-field 422.
- **`describe('GET /returns and GET /returns/{id}')`** – list + fetch own return, comma-separated `sort` param validation, cross-customer 404.
- **`describe('POST /returns/{id}/approve and /decline')`** – approve then conflicting 409, decline with reason, missing-reason 422, free-text vs enum 422, "other" without message 422, nonexistent-id 404.
- **(truncated)** – additional describes for receive/close/cancel and other staff-role branches.

## Relationships

| Neighbor | Interaction |
|---|---|
| `tests/support/contract.ts` | Side-effect import (`@tests/contract`); installs a global response interceptor that asserts every HTTP response against the spec. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` initialises a clean in-memory DB before the suite runs. |
| `tests/support/http.ts` | Provides `api` (supertest client), `authenticateAs`, `authenticateAsRole`, `loginBearer`, `staleBearerFor` for issuing requests and obtaining bearer tokens. |
| `tests/support/callers.ts` | `asAdmin` and `callerContextAs` build admin/staff caller contexts for permission checks. |
| `src/modules/users/tests/factories.ts` | `createUser` to provision customers and staff accounts. |
| `src/modules/users/index.ts` | `UserDocument` type imported for typing. |
| `src/modules/products/tests/factories.ts` | `createProduct` to create the product that goes into the order. |
| `src/modules/orders/tests/factories.ts` | `createOrder`, `toOrderItem` to build the order that a return references. |
| `src/modules/delivery/tests/factories.ts` | `carryOrderTo`, `fulfillmentOrdersOf` to advance an order to `shipped`/`delivered` with real shipment records. |
| `src/modules/delivery/index.ts` | `deliveryService` imported (used in the truncated portion, likely for warehouse receive/close flows). |
| `src/modules/returns/repository.ts` | `returnRepository` imported for direct-DB assertions (e.g., verifying state transitions without a second HTTP call). |
| `src/types/index.ts` | `OrderStatus` enum used to parametrize order states. |

## Notes

- The `@tests/contract` import is a **side-effect** module: it registers a global `afterEach`-style interceptor that runs `expect(response).toMatchContract()` on every request made through `api()`. Individual tests therefore do **not** manually assert status codes or body shapes that the spec already covers—they only assert the *branch-specific* invariants (e.g., `Location` header value, `actions` flag object, cascading order status change).
- `customerWithOrder` for `shipped`/`delivered` deliberately creates the order as `processing` first, then calls `carryOrderTo`. This ensures delivery/shipment records exist, which is a precondition for the withdrawal-vs-defective logic to behave correctly.
- The `staffAccounts` module-level counter guarantees unique emails across calls within a single test run; it resets only on process restart.
- The file is truncated in the snapshot; additional `describe` blocks (receive, close, cancel, and likely stale-token / permission tests) exist beyond what is shown.
