---
source: src/modules/account/tests/contract/shop.contract.test.ts
sha256: 3f1d577284fffd07d52a0d645dc1e570a0ce9e72d5472167cf453ece359ecea2
generated_at: 2026-10-14T09:05:43.806934+00:00
model: ollama:qwen3.8:27b
---

# src/modules/account/tests/contract/shop.contract.test.ts

## Purpose

Contract tests covering the shop-touching slices of the `/account` surface: the personal-data export (orders + payments) and the address snapshot carried by a checkout. The file is deliberately isolated so that removing the shop from the account module takes exactly this file with it, with no cross-cutting edits.

## Key elements

- **`EXPORTED_SESSION_KEYS`** – `Set<string>` (`id`, `createdAt`, `expiration`, `lastUsedAt`, `device`). Used to assert that an exported session carries *only* metadata and never a credential.
- **`describe('POST /account/export')`** – Two tests:
  - Verifies a 202→200 export response contains the caller's profile, a created order, the linked payment (including `orderId`), and exactly one session whose keys match `EXPORTED_SESSION_KEYS`.
  - Verifies that another user's order does **not** appear in the export (isolation check).
- **`describe('the address book at checkout')`** – One test that creates an address, adds a product to the cart, sets a shipping method, runs `checkoutAs`, and asserts both `shippingAddress` and `billingAddress` on the 201 response carry the expected snapshot fields.
- **`setupTestDb()`** – Called at module top level to prepare the test database before any test runs.

## Relationships

- **`tests/support/contract.ts`** – Imported as a side-effect; likely sets up shared contract-test expectations or interceptors.
- **`tests/support/setup-test-db.ts`** – Provides `setupTestDb`, the database reset/seed called once before all tests.
- **`tests/support/http.ts`** – Provides `api` (supertest-style client) and `authenticateAs` (bearer-token login for the `user` fixture).
- **`tests/support/checkout-as.ts`** – `checkoutAs(bearer)` drives the full checkout flow used in the address-snapshot test.
- **`tests/support/account-export.ts`** – `requestAndDownloadExport(bearer)` issues the 202 polling→200 download sequence.
- **`tests/support/callers.ts`** – `asCustomer(userId)` builds the caller identity passed to `createIntent`.
- **`src/modules/users/tests/factories.ts`** – `createUser` builds the "stranger" fixture for the isolation test.
- **`src/modules/products/tests/factories.ts`** – `createProduct` supplies a purchasable item for both export and checkout tests.
- **`src/modules/orders/tests/factories.ts`** – `createOrder` and `toOrderItem` build the order/item fixtures.
- **`src/modules/payments/index.ts`** – Re-exports `createIntent`, used to fabricate a payment linked to the order.
- **`src/infrastructure/http/response.ts`** – `ResponseSuccess<Payment>` type used to unwrap the intent creation result.
- **`src/types/index.ts`** – `Payment` type for the same unwrap.
- **`src/modules/account/tests/contract/support.ts`** – `loginWithCookie` performs a cookie-based login and returns the resulting bearer token (distinct from `authenticateAs` in http.ts).

## Notes

- The file imports `@tests/contract` for its side-effects only (no named binding); any change to that setup file's import path will silently break this test's preconditions.
- `createIntent` is imported from the payments module's **index** (`@modules/payments`), not directly from `services/intent.ts`; the index is the public surface.
- The comment on the payments assertion calls out `paymentService.findOwnPaymentsForExport` (in `payments/services/retention.ts`) as the *only* code path exercised here for pagination — a regression in that walker surfaces solely in this test.
- `loginWithCookie` (local support) and `authenticateAs` (shared http support) both produce bearer tokens but are used in different describes; they may differ in how the session is seeded. Don't swap them casually.
