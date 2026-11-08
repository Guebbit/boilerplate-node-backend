---
source: src/modules/orders/tests/contract/api.contract.test.ts
sha256: 4fbab4b35017cdea6eee1559528222a57732ff7f8ea27b20380a1bcb3068db46
generated_at: 2026-11-08T07:02:23.779137+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/contract/api.contract.test.ts

## Purpose

Contract (integration) tests for the `/orders` HTTP API. They exist because unit-level tests never crossed the HTTP boundary, so a shape mismatch between the implementation and `openapi.yaml` (e.g. `totalItems`/`totalQuantity`/`totalPrice` vs. a single `total`, or role-dependent response shapes on `GET /orders/{id}`) went undetected. This suite asserts actual HTTP responses against the published contract, covering list filters, scoped visibility, cancel authorization, and re-authentication.

## Key elements

- **`seedOrderFor(user, status?)`** — creates a product and a two-quantity order for the given user; the standard fixture for most tests.
- **`describe('GET /orders — the filters it now publishes')`** — asserts the `status` filter works, a moderator's `userId` filter is honoured (pinned to a scope-wildcard bug), batch `id` filter works, and a repeated scalar `userId` still returns 422.
- **`describe('GET /orders')`** — validates contract shape for unrestricted and scoped callers; confirms a customer's `deleted=true` query returns an empty list (privacy guard); asserts the three-field total (`totalItems`, `totalQuantity`, `totalPrice`) and absence of a collapsed `total`.
- **`describe('GET /orders/{id}')`** — asserts contract compliance for both the unscoped (admin) and scoped (user) code paths; parameterised 404-on-malformed-id test for each role.
- **`describe('POST /orders/{id}/cancel')`** — covers owner cancel, admin cancel of another's order, peer-operator cancel, `REAUTH_REQUIRED` 401 for a stale admin session (with assertion that nothing was mutated), no re-auth prompt for the buyer's own stale-session cancel, and 404 (not 403) for a non-owner's order to avoid existence leakage.

## Relationships

- **`tests/support/contract.ts`** — imported as a side-effect (`@tests/contract`); likely installs contract-validation middleware or global expect extensions.
- **`tests/support/setup-test-db.ts`** — `setupTestDb()` initialises the isolated test database before the suite runs.
- **`tests/support/http.ts`** — provides `api` (HTTP client), `authenticateAs`, `authenticateAsRole`, and `loginBearer` used by every test.
- **`tests/support/clock.ts`** — `freezeDate` / `advanceDate` drive the re-auth staleness tests.
- **`src/modules/orders/tests/factories.ts`** — `createOrder` and `toOrderItem` build the order fixtures.
- **`src/modules/products/tests/factories.ts`** — `createProduct` supplies the line-item product.
- **`src/modules/users/tests/factories.ts`** — `createUser` creates callers and peer accounts.
- **`src/modules/orders/repository.ts`** — `orderRepository.updateStatusIfIn` is used to transition an order to `paid` (exercising the real transition path rather than a raw column write); `orderRepository.findById` verifies the cancel was a no-op after a re-auth 401.
- **`src/modules/orders/model.ts`** — `orderModel` imported (available for schema-level assertions, if used in the truncated portion).
- **`src/modules/orders/services/index.ts`** — `orderService` imported (available for service-level assertions, if used in the truncated portion).
- **`src/types/index.ts`** — `OrderStatus` enum for type-safe status parameters.
- **`src/kernel/config.ts`** — `reauthWindowSeconds('critical')` determines how far the clock must be advanced to make a session stale.

## Notes

- The file's module doc comment records *why* the suite was written (two specific undetected bugs). Treat it as a changelog entry, not just flavour.
- `seedOrderFor` always creates a line item with quantity **2**, so `totalItems` is 1 while `totalQuantity` is 2 — the totals test relies on this distinction.
- The re-auth tests call `jest.useRealTimers()` after `advanceDate`; any new test in that block that uses fake timers must also restore them, or later tests in the file will run on a frozen clock.
- The moderator `userId`-filter test is a regression pin for a scope-wildcard permission bug; the comment explicitly says "asking for the wildcard alone silently dropped this filter." Do not simplify that test without understanding the permission model in `get-order.ts`.
- `orderModel` and `orderService` are imported but not visibly exercised in the shown portion of the file; they may be used in the truncated tail.
