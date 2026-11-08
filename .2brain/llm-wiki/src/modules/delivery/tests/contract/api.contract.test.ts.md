---
source: src/modules/delivery/tests/contract/api.contract.test.ts
sha256: b2769d0f8a6e0d22ac42a94a75ed298952a26c5f76e693b7dfd471c1a15d148e
generated_at: 2026-11-08T05:41:04.902118+00:00
model: ollama:qwen3.8:27b
---

# src/modules/delivery/tests/contract/api.contract.test.ts

## Purpose

Contract tests that exercise the delivery HTTP API (`/delivery/*`, fulfillment-order and shipment routes) against a real running server, validating every response automatically against the OpenAPI spec via `@tests/contract`. The file pins that each audience branch (public, order-owner, staff) is reachable over HTTP and returns the shape the spec promises; business-logic rules are covered separately in unit and integration suites.

## Key elements

- **`setupTestDb()`** — call at module top; seeds/resets the database before any test runs.
- **`authenticateWithShipment()`** — helper that logs in a regular user, creates a product + paid order, ships it (1 of 1 unit, tracking `TRK-CONTRACT1`), and returns the bearer token and order.
- **`adminWithOrder(quantity, extras?)`** — helper that logs in an admin, creates a processing order for `quantity` units of one product, and returns bearer, orderId, fulfillmentOrderId, and productId.
- **`describe('GET /delivery/methods', …)`** — verifies the public catalogue: non-empty list, ignores any `?weight=` filter, stamps every method with the shop currency (`EUR`).
- **`describe('GET /orders/{id}/fulfillment-orders and /shipments', …)`** — owner sees their items with all action flags set to `false`; unpaid orders return empty `items` arrays; staff see hold reasons/notes and actionable flags; buyer is denied `holdNote`; other customers get 404; no token gets 401; malformed id gets 404.
- **`describe('POST /orders/{orderId}/process', …)`** — admin moves a paid order to `processing` (200 + fulfillment orders created); non-paid order returns 409 with `ORDER_NOT_PAID` error code.
- **`describe('POST /delivery/fulfillment-orders/{id}/shipments', …)`** — full shipment (201, `Location` header, order → `shipped`); partial-quantity shipment (order stays `processing`, `fulfillmentStatus` = `partially_fulfilled`); tracked method without code yet.
- **`describe('POST /delivery/fulfillment-orders/{id}/hold', …)`** — (visible from the hold-related tests above) sets a hold reason/note, verified in subsequent reads.

## Relationships

| Neighbor | Interaction |
|---|---|
| `tests/support/contract.ts` | `import '@tests/contract'` — auto-asserts every response body against the OpenAPI spec. |
| `tests/support/http.ts` | Provides `api()` (request builder), `authenticateAs`, `authenticateAsRole`, `bearerForCookie`, `loginCompleting`. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` initialises the test database. |
| `tests/support/ids.ts` | `MISSING_ID` constant used for malformed-id assertions. |
| `tests/support/cookies.ts` | `setCookie` helper for cookie-based auth scenarios. |
| `tests/support/clock.ts` | `freezeDate` / `advanceDate` for time-dependent assertions (e.g. re-auth window). |
| `src/kernel/config.ts` | Reads `reauthWindowSeconds` to set up time-sensitive test fixtures. |
| `src/modules/delivery/tests/factories.ts` | `shipEverything`, `fulfillmentOrdersOf`, `shipmentsOf`, `paidBackorderOrder`, `paidPreorderOrder` — create/inspect delivery-domain fixtures. |
| `src/modules/orders/tests/factories.ts` | `createOrder`, `toOrderItem`, `readOrder`, `forceOrderStatus` — order fixtures and reads. |
| `src/modules/products/tests/factories.ts` | `createProduct` — product fixture. |
| `src/modules/users/tests/factories.ts` | `createAdminUser`, `PLAIN_PASSWORD` — user fixtures. |
| `src/modules/shop/index.ts` | `shopDayOf` — shop operating-day helper for date-sensitive tests. |
| `src/types/index.ts` | `OrderStatus` enum for setting/reading order state. |

## Notes

- The test file is **spec-assertion-heavy but logic-light**: it confirms *shape and status code* over HTTP, not internal business rules. Do not add act-level assertions here; those belong in unit/integration suites.
- `?weight=` query parameter on `/delivery/methods` was intentionally dropped from the API; the test explicitly guards that a stray param does not change the response shape.
- Currency on each method is asserted as `'EUR'`, reflecting the shop's configured currency — if the shop currency changes, this test must be updated in lockstep.
- The `holdNote` field is a **staff-only** payload; tests assert its absence for the buyer while the `status: 'on_hold'` and `holdReason` remain visible.
- The file is truncated in the source snapshot; the `shipments` describe block likely contains additional cases (tracked-method-without-code, error paths) beyond what is shown.
