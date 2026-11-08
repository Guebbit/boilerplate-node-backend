---
source: src/modules/orders/tests/contract/export.contract.test.ts
sha256: 6aeb06cc520534044e205be169967d132d42847fdb999793ae6ba6d270221de0
generated_at: 2026-11-08T07:02:45.233714+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/contract/export.contract.test.ts

## Purpose

Contract test for the `GET /orders/export` HTTP endpoint. It verifies the wire-level behaviour a client depends on — status codes, response headers (content-type, content-disposition, cache-control), authentication gates, and the 422 error shape — without asserting on CSV content correctness (that belongs to the service suite). The route must resolve as a fixed path, not as an order-id parameter.

## Key elements

- **`seedOrderFor(user)`** – local helper that creates one product and one single-item order belonging to the given user, so the export has at least one data row.
- **`describe('GET /orders/export')`** – six `it` blocks covering:
  - Admin receives 200 with `text/csv`, `attachment; filename="orders-YYYY-MM-DD.csv"`, `private, no-store`, and a two-line body.
  - First byte is U+FEFF (UTF-8 BOM) for Excel compatibility.
  - A `manager` role also receives 200.
  - A session older than `reauthWindowSeconds('sensitive')` is rejected with 401.
  - With `NODE_ORDER_EXPORT_MAX_ROWS=1` and two orders, the endpoint returns 422 `application/problem+json` with `errors[0].code === 'ORDER_EXPORT_TOO_LARGE'` and no `content-disposition` header.
  - An invalid `?status=` filter is rejected with 422 (delegated to the list handler's validation).
- **`afterEach(() => jest.useRealTimers())`** – restores the system clock after the frozen-time test.

## Relationships

| Neighbor | Interaction |
|---|---|
| `tests/support/contract.ts` | Side-effect import (`@tests/contract`) – likely registers global contract-test helpers/expectations. |
| `tests/support/setup-test-db.ts` | Calls `setupTestDb()` once at module scope to provision a clean DB per test. |
| `tests/support/http.ts` | Provides `api`, `authenticateAs`, `authenticateAsRole`, `bearerForCookie`, `loginCompleting` for issuing requests and building auth. |
| `tests/support/cookies.ts` | `setCookie` extracts the `__Host-session` JWT from a login response for the stale-session test. |
| `tests/support/clock.ts` | `freezeDate` / `advanceDate` drive the reauth-window expiration. |
| `tests/support/environment.ts` | `setEnvironment` sets `NODE_ORDER_EXPORT_MAX_ROWS` for the cap test. |
| `src/kernel/config.ts` | `reauthWindowSeconds('sensitive')` determines how far to advance the clock in the 401 test. |
| `src/modules/users/tests/factories.ts` | `createAdminUser`, `PLAIN_PASSWORD` for the stale-session scenario. |
| `src/modules/products/tests/factories.ts` | `createProduct` seeds the order item. |
| `src/modules/orders/tests/factories.ts` | `createOrder`, `toOrderItem` build the test order. |

## Notes

- The module doc explicitly defers CSV content and cap-arithmetic assertions to the service-level test suite; this file only checks the HTTP envelope.
- The 401 test uses a *cookie-based* bearer (`bearerForCookie`) rather than `authenticateAs`, because it needs full control over the session's age.
- The too-large test asserts the absence of `content-disposition` to confirm the cap fires *before* the file stream starts.
- The bad-filter test (`?status=teleported`) relies on the list endpoint's own validation; no new 422 shape is expected beyond what the list contract already guarantees.
