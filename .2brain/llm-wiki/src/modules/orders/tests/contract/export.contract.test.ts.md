---
source: src/modules/orders/tests/contract/export.contract.test.ts
source_sha256: c9d63da0d9d056bb0338a8ad60d092cf69c9ea07d164d5e192ce2ce4c9f39527
context_sha256: e75ba835fdd9fc58a3bd2dc1c18ea127e597e1699e848eac303861d31e83c172
generated_at: 2026-11-22T06:25:24.898116+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/tests/contract/export.contract.test.ts

## Purpose
HTTP-level contract test for `GET /orders/export`. It checks that the route is reached through the router (`/export` is not read as an order id), is protected by the `export:Order` permission and a fresh session, is never cached, and refuses an oversized result before any file bytes are sent. The CSV's content and the cap's arithmetic are left to the service suite.

## Key elements
- `seedOrderFor(user)`: local helper that creates one order for the given user, containing a single item for a newly created product, so the export has a line to carry.
- `describe('GET /orders/export')` cases:
  - **Admin success**: 200, `text/csv`, `attachment; filename=orders-YYYY-MM-DD.csv`, `Cache-Control: private, no-store`, and two lines of text (the header plus one order).
  - **BOM**: the body starts with U+FEFF (the test's own description: so Excel reads accents as UTF-8). The test asserts `codePointAt(0)` equals `0xfe_ff`, i.e. U+FEFF.
  - **Manager**: 200, since managers also hold the permission.
  - **Stale session**: an admin whose session is older than `reauthWindowSeconds('sensitive')` gets 401.
  - **Too large**: with `NODE_ORDER_EXPORT_MAX_ROWS=1` and two orders, the response is 422 `application/problem+json` with error code `ORDER_EXPORT_TOO_LARGE` and no `Content-Disposition` header.
  - **Bad filter**: `?status=teleported` returns 422, the same response the list endpoint gives.
- `afterEach(() => jest.useRealTimers())`: undoes the frozen clock from the stale-session test.

## Relationships
- `@tests/contract`: side-effect import that sets up the contract-test environment.
- `tests/support/setup-test-db.ts`: `setupTestDb()` provides the database lifecycle.
- `tests/support/environment.ts`: `setEnvironment` overrides `NODE_ORDER_EXPORT_MAX_ROWS` for the cap test.
- `tests/support/http.ts`: `api()` (request client), `authenticateAs`, `authenticateAsRole`, `loginCompleting` and `bearerForCookie` produce authenticated requests.
- `tests/support/cookies.ts`: `setCookie` extracts the `__Host-session` cookie from the login response.
- `tests/support/clock.ts`: `freezeDate` and `advanceDate` simulate session ageing.
- `src/kernel/config.ts`: `reauthWindowSeconds` gives the sensitive-session window the test steps past.
- `src/modules/users/tests/factories.ts` (`createAdminUser`, `PLAIN_PASSWORD`), `src/modules/products/tests/factories.ts` (`createProduct`) and `src/modules/orders/tests/factories.ts` (`createOrder`, `toOrderItem`) seed data.

## Notes
- The stale-session test logs in with `remember: 'short'`, advances the clock past the window plus one second, then mints a bearer from the old cookie via `bearerForCookie`.
- The BOM test calls `.buffer()` on the request so the response body is read as text and the leading character is preserved.
- Passing the stale-session test depends on the frozen date, since the clock is reset only in `afterEach`.
