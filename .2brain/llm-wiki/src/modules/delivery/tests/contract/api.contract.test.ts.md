---
source: src/modules/delivery/tests/contract/api.contract.test.ts
sha256: 542fa190c7e1c020b519a4d9592a7d3a84e34684442e274be4d9fe8fb3d6308a
generated_at: 2026-10-14T15:35:29.481579+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the `/delivery` API exercised over real HTTP. Every response is auto-validated against the API spec via `@tests/contract`. The file pins that nine routes across three audiences (public, order-owner, staff) each return a spec-conforming shape and that the correct branch (200 / 403 / 404 / 409 / 422) is reachable. Business-rule correctness of the acts themselves is deliberately left to the unit and integration suites.

## Key elements

- **`authenticateWithShipment`** (local helper) — creates a user, a product, an order, and ships everything; returns the bearer token and order so owner-read tests have a shipped record.
- **`adminWithOrder(quantity, extras?)`** (local helper) — creates an admin, a product, a processing order, and returns bearer + `orderId` + `fulfillmentOrderId` + `productId` for staff-write tests.
- **`describe('GET /delivery/methods')`** — four tests: unauthenticated 200, resilience to a stale `?weight=` query param, `shipToCountries` reflecting `NODE_SHOP_COUNTRY`, and every method stamped with the shop currency.
- **`describe('GET /delivery/order/{orderId}')`** — four tests: owner sees both lists with read-only actions, unpaid order returns empty arrays, staff sees mutable actions + hold note, 404 for another customer's order.
- **`describe('POST /delivery/order/{orderId}/start')`** — three tests: paid → processing (200) and fulfillment orders appear; unpaid → 409; customer → 403.
- **`describe('POST /delivery/fulfillment-orders/{id}/shipments')`** — five+ tests (file truncated): 201 + `Location` header on full ship; partial ship leaves order `processing`; 422 `DELIVERY_TRACKING_CODE_REQUIRED`; 422 `DELIVERY_LINES_INVALID` (over-quantity); 422 for digital fulfillment order.

## Relationships

| Neighbor | Interaction |
|---|---|
| `tests/support/contract.ts` | `import '@tests/contract'` — side-effect import that registers the auto contract matcher used by every `expect(response).toMatchContract()` assertion. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` called once at module scope to provision and clean the test database. |
| `tests/support/http.ts` | `api()`, `authenticateAs`, `authenticateAsRole`, `bearerForCookie` — the HTTP client and auth helpers used by every request. |
| `tests/support/ids.ts` | `MISSING_ID` — sentinel ID for 404 / not-found assertions. |
| `tests/support/cookies.ts` | `setCookie` — sets session cookies where bearer auth is not the mechanism. |
| `tests/support/clock.ts` | `freezeDate`, `advanceDate` — deterministic time for time-dependent contract branches. |
| `src/modules/delivery/tests/factories.ts` | `fulfillmentOrdersOf`, `paidPreorderOrder`, `shipEverything`, `shipmentsOf` — delivery-domain fixtures. |
| `src/modules/orders/tests/factories.ts` | `createOrder`, `readOrder`, `toOrderItem` — order fixtures consumed to set up delivery state. |
| `src/modules/products/tests/factories.ts` | `createProduct` — product fixture (physical / digital). |
| `src/modules/users/tests/factories.ts` | `createAdminUser`, `PLAIN_PASSWORD` — user fixtures for auth. |
| `src/kernel/config.ts` | `reauthWindowSeconds` — used when testing re-authentication timing in a contract branch. |
| `src/types/index.ts` | `OrderStatus` enum — drives fixture setup and assertions. |

## Notes

- `setupTestDb()` runs **once per file** (module top-level), not per test; tests within a `describe` block share that database state.
- The `?weight=10000` test is intentional regression coverage: the methods endpoint is now an unfiltered catalogue, and the test guards against a query param silently altering the response shape.
- `shipToCountries` is asserted against `['IT']` because `tests/support/setup-environment.ts` sets `NODE_SHOP_COUNTRY=IT` and leaves `NODE_SHIP_TO_COUNTRIES` unset. Currency assertions are likewise pinned to `EUR` by the same environment.
- The file explicitly does **not** assert business invariants (e.g. "you can't ship more than the order total" beyond the 422 code); those rules belong to the unit/integration suites. Contract tests only verify that the *shape and status* of the response matches the published spec.
