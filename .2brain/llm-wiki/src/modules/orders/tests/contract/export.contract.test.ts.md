---
source: src/modules/orders/tests/contract/export.contract.test.ts
sha256: 8f30ec7cdab891b0472cfeeb54889cd7be17471dbf07037eb4ba800fc8df7a23
generated_at: 2026-10-15T11:12:43.461306+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/contract/export.contract.test.ts

## Purpose

Contract test for `GET /orders/export` over HTTP. Verifies the endpoint's "shell" — routing (not interpreted as an order id), auth/role gating, response headers (CSV content-type, `attachment` disposition, `private, no-store` cache control), the UTF-8 BOM prefix, the 422 `ORDER_EXPORT_TOO_LARGE` JSON error returned before any file bytes, and the 422 shape inherited from the list endpoint. CSV column content and cap arithmetic are explicitly delegated to the service suite.

## Key elements

- **`seedOrderFor`** – creates one order (one line-item, one product) for the given user so the export has exactly one data row.
- **`describe('GET /orders/export')`** – the test suite itself:
  - Admin receives `200` with `text/csv`, `attachment`, `private, no-store`, and 2 lines (header + 1 row).
  - First byte is U+FEFF (BOM) so Excel decodes accents as UTF-8 (uses `.buffer()` to inspect raw bytes).
  - Manager (holds `orders.any.export`) gets `200`.
  - `customer`, `support`, `warehouse`, `moderator` each get `403`.
  - Anonymous caller gets `401`.
  - Admin with a session older than `reauthWindowSeconds('sensitive')` gets `401` (uses frozen clock + `remember: 'short'` login).
  - Two orders with `NODE_ORDER_EXPORT_MAX_ROWS=1` → `422` JSON with `errors[0].code === 'ORDER_EXPORT_TOO_LARGE'`.
  - `?status=teleported` → `422` (same shape as the list endpoint's bad-filter error).
- **`afterEach(() => jest.useRealTimers())`** – restores real timers after any test that called `freezeDate`.

## Relationships

- **`tests/support/http.ts`** – provides `api`, `authenticateAs`, `authenticateAsRole`, `bearerForCookie` (all HTTP calls and auth setup).
- **`tests/support/contract.ts`** – imported as a side-effect; likely registers shared contract-test hooks or assertions.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` initialises the in-test database before any test runs.
- **`tests/support/environment.ts`** – `setEnvironment` to inject `NODE_ORDER_EXPORT_MAX_ROWS` at runtime.
- **`tests/support/cookies.ts`** – `setCookie` extracts the `__Host-session` JWT from the login response.
- **`tests/support/clock.ts`** – `freezeDate` / `advanceDate` to simulate elapsed time for the stale-session test.
- **`src/kernel/config.ts`** – `reauthWindowSeconds('sensitive')` defines the threshold advanced past.
- **`src/modules/users/tests/factories.ts`** – `createAdminUser`, `PLAIN_PASSWORD` for the stale-session scenario.
- **`src/modules/orders/tests/factories.ts`** – `createOrder`, `toOrderItem` to seed fixture data.
- **`src/modules/products/tests/factories.ts`** – `createProduct` (one product per seeded order item).

## Notes

- The BOM assertion calls `.buffer()` on the request, which disables response text decoding; all other tests rely on the default text mode.
- The oversized-export test sets the cap to `1` row and seeds `2` orders, so the rejection triggers with the minimum possible fixture.
- The stale-session test logs in with `remember: 'short'` specifically to ensure the cookie's lifetime is governed by the sensitive-window reauth rule, not a long-lived token.
- The bad-filter test (`status=teleported`) asserts only the status code and the "list's own 422" shape — it does not re-validate the error body independently.
