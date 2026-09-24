---
source: src/modules/orders/tests/contract/api.contract.test.ts
sha256: 26bd1a7b048e696cff42f1824bcaf38f0582281a2ffc84690f500dd635a30482
generated_at: 2026-09-23T19:09:33.813106+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the `/orders` resource that validate every HTTP response against the OpenAPI spec via `toSatisfyApiSpec()`. The file exists because the orders API had drifted from its published contract (a list endpoint returned `totalItems`/`totalQuantity`/`totalPrice` where the spec declared a single `total`, and `GET /orders/{id}` returned different shapes per caller role) and no test crossed the HTTP boundary to catch either divergence.

## Key elements

- **`jest.mock('@infrastructure/adapters/pdf', …)`** — stubs `renderHtmlToPdf` to return a fixed `Buffer`; no real PDF renderer is exercised here (unit coverage lives in `orders/tests/unit/invoice.test.ts`).
- **`seedOrderFor(user)`** — creates a product and a single-line order (qty 2) for the given user; shared by every test that needs a real invoice-able order.
- **`describe('GET /orders — the filters it now publishes')`** — asserts `status` and `notes` query filters work, that a moderator's `userId` filter is honoured (not just admin's), that `id` accepts a batch (Tier A) while repeated `userId` returns 422.
- **`describe('GET /orders')`** — validates the list response shape for unrestricted and scoped callers; pins the three-totals contract (`totalItems`, `totalQuantity`, `totalPrice`) and asserts the legacy `total` key is absent.
- **`describe('GET /orders/{id}')`** — contract-validates both the unscoped (`findById`) and scoped (aggregate) code paths; tests malformed-id 404 per role; invoice route 404, cross-customer 404 for scoped callers, admin 200, and synchronous 200 on first request.
- **`describe('POST /orders/{id}/cancel')`** — owner and admin cancellation of a pending order (content truncated in source).

## Relationships

- **`tests/support/contract.ts`** — imported as `@tests/contract`; registers the `toSatisfyApiSpec()` matcher used on every response assertion.
- **`tests/support/http.ts`** — provides `api()` (supertest-style HTTP client), `authenticateAs(role)`, and `authenticateAsRole(role)` for obtaining bearer tokens per role.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` is called at module scope to reset/prepare the test database before any test runs.
- **`src/modules/orders/repository.ts`** — `orderRepository` is imported directly to call `updateStatusIfIn`, transitioning a seeded order from `pending` to `paid` through the application's own status-transition guard (rather than writing the column directly).
- **`src/modules/orders/tests/factories.ts`** — `createOrder` and `toOrderItem` build the order fixtures.
- **`src/modules/products/tests/factories.ts`** — `createProduct` supplies the product referenced by order lines.
- **`src/modules/users/tests/factories.ts`** — `createUser` and `PLAIN_PASSWORD` create ad-hoc user accounts (e.g. the "stranger" who must not see another customer's invoice).

## Notes

- The PDF adapter mock mirrors the one in `orders/tests/unit/invoice.test.ts`; it is safe because the invoice route renders synchronously and these tests only assert status/headers, never PDF bytes.
- Malformed-id tests run **per role** (`it.each`): the unscoped path raises a Mongoose `CastError` → 404, while the scoped aggregate raises a `BSONError` → 422 unless an upstream guard intercepts first. A single combined test would mask a regression on either path.
- `id` is a **batch** query parameter (accepts repeated keys); `userId` and `productId` are intentionally **scalar** — a repeated scalar key must return 422, not silently read the first value.
- The moderator `userId` filter test pins a specific past bug: `orders.any.read` is held by named permission, not via the scope wildcard a moderator lacks, so the filter was silently dropped for them.
- All response assertions that check shape use `toSatisfyApiSpec()` (validates against `openapi.yaml`); assertions that check specific field values (totals, status string) are written explicitly alongside.
