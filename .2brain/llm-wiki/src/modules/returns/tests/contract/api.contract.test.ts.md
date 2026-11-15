---
source: src/modules/returns/tests/contract/api.contract.test.ts
sha256: 1e759986c226aed187bb5e4c6bb14ef4505aab0cf665c2ff4ca10062284854a4
generated_at: 2026-11-14T21:42:07.936202+00:00
model: ollama:qwen3.8:27b
---

# src/modules/returns/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the `/returns` API executed over real HTTP. Every response is automatically validated against the shared spec (`@tests/contract`). The suite exists to pin that each contractual branch is reachable and shaped correctly: the `201 + Location` for new returns, the withdrawal-before-dispatch path that yields a closed return, staff approve/decline decisions, and the specific refusal codes a client can act on (422, 409, 404).

## Key elements

- **`customerWithOrder(status)`** — creates an authenticated customer, a product, and an order in the given `OrderStatus`. For `shipped`/`delivered` it additionally runs `carryOrderTo` so real fulfillment records exist. Returns `{ bearer, orderId, productId }`.
- **`staffUser(role)`** — mints a distinct, verified staff account (module-level counter for unique emails).
- **`requested()`** — produces a `requested`-status return plus a manager bearer, for use in the decision tests.
- **`describe('POST /returns')`** — eight cases covering: 201 shipped withdrawal (approved), 201 pre-dispatch withdrawal (closed + order canceled), listing via `GET /returns?orderId=`, 422 too-many-units (`RETURN_LINES_INVALID`), 422 invalid reason, 409 canceled order (`RETURN_ORDER_NOT_RETURNABLE`), 404 wrong-owner order, 422 unknown body field.
- **`describe('GET /returns and GET /returns/{id}')`** — list + single fetch; asserts list items carry `actions` but **exclude** `note`, `declineMessage`, `lines`, `returnPostage`; tests comma-separated `sort` param and rejection of non-enum sort fields; 404 for a stranger's return.
- **`describe('POST /returns/{id}/approve and /decline')`** — approve (200) then second decision (409 `RETURN_NOT_DECIDABLE`); decline with reason/message (200); decline without reason (422); free-text-vs-code enforcement (truncated).

## Relationships

| Neighbor | Role in this file |
|---|---|
| `tests/support/contract.ts` | Side-effect import; augments every response with spec-based assertions |
| `tests/support/setup-test-db.ts` | `setupTestDb()` resets the test database before the suite runs |
| `tests/support/http.ts` | `api`, `authenticateAs`, `authenticateAsRole`, `loginBearer`, `staleBearerFor` — HTTP client & auth helpers |
| `tests/support/callers.ts` | `asAdmin`, `callerContextAs` — staff-role caller contexts |
| `src/modules/users/tests/factories.ts` | `createUser` for customer/staff accounts |
| `src/modules/users/index.ts` | `UserDocument` type import |
| `src/modules/products/tests/factories.ts` | `createProduct` |
| `src/modules/orders/tests/factories.ts` | `createOrder`, `toOrderItem` |
| `src/modules/delivery/tests/factories.ts` | `carryOrderTo`, `fulfillmentOrdersOf` — advance order through real delivery to create shipments |
| `src/modules/delivery/index.ts` | `deliveryService` (exported from the module barrel) |
| `src/types/index.ts` | `OrderStatus` enum |
| `src/modules/returns/repository.ts` | `returnRepository` — direct data access used for assertions or setup outside the HTTP surface |

## Notes

- `setupTestDb()` is called **at module top level**, not inside `beforeEach`; the entire file shares one reset.
- `customerWithOrder` intentionally uses `carryOrderTo` for `shipped`/`delivered` rather than simply patching the status field, because the delivery module's state (shipments, fulfillment orders) must be consistent for downstream assertions.
- The list-item shape test explicitly asserts the **absence** of `note`, `declineMessage`, `lines`, and `returnPostage`—these are detail-only fields that must never leak into `GET /returns` responses.
- The `staffUser` helper relies on a mutable module-level counter (`staffAccounts`) for unique emails; tests that run in parallel within the same worker could collide if the counter is not sufficient.
- The file is truncated in this snapshot; the final `describe` block (approve/decline) has at least one additional test beyond what is shown.
