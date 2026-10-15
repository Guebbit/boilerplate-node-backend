---
source: src/modules/orders/tests/contract/api.contract.test.ts
sha256: 7e2b8f2d46c4e0db4486a793c092e35cfa338c2a3733df69805e5f2d04c56e70
generated_at: 2026-10-15T11:12:28.412069+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/contract/api.contract.test.ts

## Purpose

Contract test suite for the `/orders` REST endpoints. It was created to catch two classes of regression that unit tests miss: response-shape drift from the OpenAPI spec (e.g. `totalItems`/`totalQuantity`/`totalPrice` vs. a single `total`) and role-dependent response differences on the same route. Every assertion that goes beyond a plain 200 check pins a specific past bug or a contract nuance (filter semantics, error codes, role gating) that no other test in the repo covers.

## Key elements

- **`seedOrderFor(user, status?)`** – Local helper that creates a product and a two-item order for the given user; returns the order document. Keeps seed setup uniform across tests.
- **`describe('GET /orders — the filters it now publishes')`** – Verifies `status`, `userId`, and batch `id` filters via HTTP; also asserts that a repeated scalar `userId` param yields 422 (not silently-read-first-value).
- **`describe('GET /orders')`** – Confirms the listing response matches the OpenAPI contract for both unrestricted (admin) and scoped (regular user) callers, and that order items expose three separate totals rather than a collapsed `total`.
- **`describe('GET /orders/{id}')`** – Validates both the unscoped and scoped single-order response against the contract, and asserts a malformed ID returns 404 (not 422) for both `admin` and `user` roles.
- **`describe('POST /orders/{id}/cancel')`** – Covers owner cancel, cross-user admin cancel, `OUTRANKED` 403 for peer admins, 404 for strangers (no existence leak), 409 for non-pending or double-cancel, and 422 for malformed body (`refund` as string, unknown key).
- **`describe('POST /orders/{id}/status-override')`** – (Truncated in source) exercises the status-override endpoint's contract and role gating.

## Relationships

- **`tests/support/contract.ts`** – Imported as a side-effect (`import '@tests/contract'`); installs global response-shape validation against `openapi.yaml` so every `api()` call is automatically checked.
- **`tests/support/http.ts`** – Provides `api()` (supertest wrapper), `authenticateAs`, `authenticateAsRole`, and `loginBearer`; all HTTP calls in this file go through these helpers.
- **`tests/support/setup-test-db.ts`** – `setupTestDb()` is called at module scope to create and reset the test database before any test runs.
- **`src/modules/orders/tests/factories.ts`** – Source of `createOrder` and `toOrderItem` used to seed realistic order documents with line items.
- **`src/modules/products/tests/factories.ts`** – Source of `createProduct`; every order seed depends on a product first.
- **`src/modules/users/tests/factories.ts`** – Source of `createUser`; used to manufacture role-specific callers (admin, moderator, peer, stranger).
- **`src/modules/orders/repository.ts`** – `orderRepository.updateStatusIfIn` is called directly to transition an order out of `pending` (to `paid`/`shipped`) because the API does not expose a free-form status setter; `findById` is used to confirm a rejected cancel left the record untouched.
- **`src/modules/orders/services/index.ts`** – `orderService` is imported (visible in the import list); used in the truncated `status-override` section to exercise service-level behaviour through the HTTP layer.
- **`src/types/index.ts`** – Provides the `OrderStatus` enum used in the `seedOrderFor` signature and repository calls.

## Notes

- The `import '@tests/contract'` line is a **side-effect import**—there is no named binding. It must execute before any `api()` call for shape validation to be active; reordering imports or tree-shaking could silently disable it.
- Role-scoped tests intentionally seed a "stranger's" order in the same collection to prove the scope filter actually excludes it; removing that seed would make the scope assertion vacuous.
- Status transitions are driven through `orderRepository.updateStatusIfIn` (a conditional DB write) rather than the HTTP API, because the API only allows specific transitions and the tests need arbitrary target states.
- The `id` filter is batch (Tier A) while `userId` and `productId` remain scalar; the 422-on-repeated-key assertion is a regression guard specifically for that asymmetry.
- The `OUTRANKED` 403 case requires two distinct admin users (the peer is created with the `admin` role argument to `createUser`); a single admin cannot trigger the outrank check against itself.
- Comments in the file are deliberately verbose and reference specific past bugs (wildcard-scope drop for moderators, `BSONError` → 404 vs 422). Treat them as part of the spec; removing them loses the "why" that justifies the assertion.
