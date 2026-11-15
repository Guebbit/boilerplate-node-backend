---
source: src/modules/orders/tests/contract/api.contract.test.ts
sha256: aac62ce24846c0173bd7c2b8df8409f6168226a3968f3a91bc17a6bb641081ad
generated_at: 2026-11-14T20:48:55.032651+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/tests/contract/api.contract.test.ts

## Purpose

Contract tests for the `/orders` HTTP surface. This suite exists because no prior test exercised the API over HTTP: the list endpoint once returned `totalItems`/`totalQuantity`/`totalPrice` while `openapi.yaml` specified a single `total`, and `GET /orders/{id}` answered a different shape per caller role. Every test here asserts that the live response matches the published contract for each role.

## Key elements

- **`seedOrderFor(user, status?)`** – module-level helper that creates a product, then an order with one line item (qty 2); optionally pins a status.
- **`describe('GET /orders — the filters it now publishes')`** – verifies `status`, `userId`, and batch `id` query filters; confirms repeated `userId` still 422s (scalar, not array).
- **`describe('GET /orders')`** – asserts list response shape per role (admin unrestricted, user scoped), that `deleted=true` is ignored for customers, that list items omit personal data (`email`, `shippingAddress`, `notes`, etc.), and that the single-order read retains `totalItems`/`totalQuantity`/`email`.
- **`describe('GET /orders/{id}')`** – asserts both unscoped (admin) and scoped (user) paths match the contract; a parameterised case confirms a malformed id returns 404 (not 422) for each role.
- **`describe('POST /orders/{id}/cancel')`** – covers owner cancel, admin cancel of another's order, operator cancelling a peer's order, and the reauth (401 `REAUTH_REQUIRED`) guard on stale operator sessions.

## Relationships

| Neighbor | Interaction |
|---|---|
| `tests/support/contract.ts` | Side-effect import; registers contract matchers used implicitly by `api()` assertions. |
| `tests/support/setup-test-db.ts` | `setupTestDb()` initialises the test database before the suite runs. |
| `tests/support/http.ts` | Provides `api()`, `authenticateAs`, `authenticateAsRole`, `loginBearer` for making authenticated HTTP calls. |
| `tests/support/clock.ts` | `freezeDate` / `advanceDate` control time for the reauth-window test. |
| `src/modules/orders/tests/factories.ts` | `createOrder`, `toOrderItem` build order fixtures. |
| `src/modules/products/tests/factories.ts` | `createProduct` supplies the line-item product. |
| `src/modules/users/tests/factories.ts` | `createUser` mints accounts for role-specific scenarios. |
| `src/modules/orders/model.ts` | `orderEventModel`, `orderModel` referenced for typing or assertion helpers. |
| `src/modules/orders/repository.ts` | `orderRepository` imported for direct repository access in the status-filter test. |
| `src/modules/orders/friends/payments.ts` | `markPaid` used to mark an order paid before the cancel/reauth tests. |
| `src/infrastructure/persistence/create-repository.ts` | `toObjectId` for id conversion. |
| `src/types/index.ts` | `OrderStatus` enum used in `seedOrderFor` and filter assertions. |
| `src/kernel/config.ts` | `reauthWindowSeconds` sets the reauth threshold for the 401 test. |

## Notes

- Status transitions are reached through the repository rather than by writing the column directly; the comment explains that a status the application cannot naturally produce is not worth filtering on.
- `id` is a **batch** filter (repeated `?id=` allowed); `userId` and `productId` are intentionally **scalar** — a repeated key must 422, not silently take the first value.
- The `@tests/contract` import is side-effect-only (no named binding); it likely registers global expect matchers or serialises the OpenAPI spec for comparison.
- The file's leading doc block documents the *origin* of the suite (two specific bugs it was created to pin) — useful context if someone questions why both `totalItems` and `total` shapes are asserted.
- The reauth test uses `freezeDate()` and `reauthWindowSeconds` together; advancing the clock past that window is what triggers the 401.
