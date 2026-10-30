---
source: src/modules/orders/tests/contract/export.contract.test.ts
sha256: 6aeb06cc520534044e205be169967d132d42847fdb999793ae6ba6d270221de0
generated_at: 2026-10-29T04:51:25.804610+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/contract/export.contract.test.ts

## Purpose

Contract (HTTP-level) test for `GET /orders/export`. It verifies the endpoint's observable HTTP surface — status codes, content-type, content-disposition, cache-control, BOM byte, role acceptance, session-freshness enforcement, and error shapes — without asserting on CSV column content or cap arithmetic, which the module doc explicitly delegates to the service suite.

## Key elements

- **`seedOrderFor(user)`** – Local helper that creates one product and a single-line order belonging to `user`, giving the export file at least one data row.
- **`describe('GET /orders/export')`** – Six test cases:
  - Admin receives **200** with `text/csv`, `attachment; filename="orders-YYYY-MM-DD.csv"`, and `private, no-store` cache-control.
  - Response body begins with **UTF-8 BOM** (`0xFEFF`), verified via `.buffer()` + `codePointAt(0)`.
  - **Manager** role is also accepted (200).
  - A session older than `reauthWindowSeconds('sensitive')` is **rejected 401**.
  - Exceeding `NODE_ORDER_EXPORT_MAX_ROWS` yields **422** with `application/problem+json` and error code `ORDER_EXPORT_TOO_LARGE`; no `content-disposition` header is present.
  - An invalid query filter (`?status=teleported`) returns the list endpoint's own **422**.
- **`afterEach(() => jest.useRealTimers())`** – Restores real timers after the freeze/advance usage in the stale-session test.

## Relationships

| Neighbor | Interaction |
|---|---|
| `tests/support/contract.ts` | Side-effect import (`import '@tests/contract'`); likely registers shared contract-test conventions or globals. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` called at module top-level to provision/tear down a test database. |
| `tests/support/http.ts` | Provides `api`, `authenticateAs`, `authenticateAsRole`, `bearerForCookie`, `loginCompleting` for making authenticated requests and extracting credentials. |
| `tests/support/cookies.ts` | `setCookie` extracts the `__Host-session` cookie from a login response for the stale-session test. |
| `tests/support/clock.ts` | `freezeDate` / `advanceDate` control time in the stale-session test. |
| `tests/support/environment.ts` | `setEnvironment` overrides `NODE_ORDER_EXPORT_MAX_ROWS` to exercise the cap. |
| `src/kernel/config.ts` | `reauthWindowSeconds('sensitive')` supplies the threshold for the stale-session assertion. |
| `src/modules/users/tests/factories.ts` | `createAdminUser`, `PLAIN_PASSWORD` create a user with a known password for the login-completing flow. |
| `src/modules/products/tests/factories.ts` | `createProduct` supplies a valid product for `toOrderItem`. |
| `src/modules/orders/tests/factories.ts` | `createOrder`, `toOrderItem` build the order and line item used as seed data. |

## Notes

- The module doc comment is a contract boundary: **CSV column content and cap arithmetic belong to the service test suite**, not this file. Don't add content-assertion tests here.
- The BOM test calls `.buffer()` on the SuperAgent response; without it, SuperAgent decodes the body as text and the first codepoint check would be meaningless.
- The stale-session test depends on `reauthWindowSeconds('sensitive')` from kernel config; if that config key or the `'sensitive'` label changes, the test breaks silently (wrong window, still 200).
- `@tests/contract` is imported for its side effects only—no named bindings are consumed, so tree-shaking or import-order changes can silently drop whatever it registers.
