---
source: src/modules/orders/tests/contract/api.contract.test.ts
sha256: 00a2df0c3cec6a0a04d0d17990626ea98791d7c17e5c319893304f2cfe99bc20
generated_at: 2026-09-27T15:16:44.504833+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/contract/api.contract.test.ts

## Purpose
Contract tests for the `/orders` HTTP API. This suite exists because the list endpoint previously returned `totalItems`/`totalQuantity`/`totalPrice` while `openapi.yaml` declared a single `total`, and `GET /orders/{id}` answered a different shape per caller role — neither mismatch was caught until tests exercised the actual HTTP boundary. Every assertion here validates responses against the OpenAPI spec via `toSatisfyApiSpec()` and pins role-specific scoping behavior.

## Key elements
- **`seedOrderFor(user)`** — local helper; creates a product and a single-item order for the given user, used across all `describe` blocks.
- **`jest.mock('@infrastructure/adapters/pdf')`** — stubs `renderHtmlToPdf` with a fixed `Buffer`, so invoice-route tests don't require a real PDF renderer.
- **`describe('GET /orders — the filters it now publishes')`** — verifies `status`, `notes`, `userId` (scalar), and `id` (batch) query filters; also asserts that a repeated `userId` key yields 422.
- **`describe('GET /orders')`** — contract compliance for the list endpoint as admin (unrestricted) and as a plain user (scoped to own orders); pins the three-field total shape and absence of a collapsed `total`.
- **`describe('GET /orders/{id}')`** — contract compliance on both the unscoped (admin) and scoped (user) paths; 404 on malformed ids per role; invoice-route scope (stranger gets 404, admin gets 200 with `application/pdf`).
- **`describe('POST /orders/{id}/cancel')`** — owner-cancel behavior per role (content truncated in this excerpt).

## Relationships
- **`tests/support/contract.ts`** — provides the `toSatisfyApiSpec()` Jest matcher that validates every response body/headers against `openapi.yaml`.
- **`tests/support/http.ts`** — provides `api()` (supertest wrapper), `authenticateAs()`, and `authenticateAsRole()` for obtaining role-specific bearer tokens.
- **`tests/support/setup-test-db.ts`** — called once at module level (`setupTestDb()`) to initialise the test database before any test runs.
- **`src/modules/orders/tests/factories.ts`** — source of `createOrder` and `toOrderItem` used to seed order data.
- **`src/modules/products/tests/factories.ts`** — source of `createProduct`, the prerequisite line-item entity.
- **`src/modules/users/tests/factories.ts`** — source of `createUser` and the `PLAIN_PASSWORD` constant used for the stranger-login sub-case in the invoice scope test.
- **`src/modules/orders/repository.ts`** — `orderRepository.updateStatusIfIn` is called directly (bypassing HTTP) to transition an order from `pending` to `paid` so the status-filter test has a non-default state.

## Notes
- Status transitions in the filter test go through the repository method rather than a raw DB write, because only application-reachable statuses are worth filtering on.
- Scope correctness is proven by **absence**: a stranger's order is seeded and must not appear in a scoped caller's results. The API does not return an explicit "denied" for out-of-scope reads.
- Malformed-id cases (404) are asserted per role because the controller's `isValidObjectId` pre-check lives in each route handler; a regression that drops the check on one route would otherwise go uncaught.
- The invoice scope test for a stranger performs a real `POST /account/login` to obtain that user's token, rather than using `authenticateAs`, to exercise the full auth path.
- `userId` and `productId` filters are intentionally scalar; `id` is a batch (Tier A) filter. Repeated scalar keys must 422, not silently pick the first value.
