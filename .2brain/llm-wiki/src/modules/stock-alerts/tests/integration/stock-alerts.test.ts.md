---
source: src/modules/stock-alerts/tests/integration/stock-alerts.test.ts
sha256: c79561fe4199b8c7651b5fa52e3c776bcdb16fb39825d7ae753165a985174893
generated_at: 2026-11-14T22:05:35.208378+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stock-alerts/tests/integration/stock-alerts.test.ts

## Purpose

Integration tests for the stock-alerts module that exercise the full HTTP surface (create, list, cancel a back-in-stock request) and the restock signal path, with real module wiring registered. The goal is to verify the module's behavior end-to-end—including the `module.ts` registration—without mocking the service layer or repositories.

## Key elements

- **Mock of `enqueueEmail`** (`@infrastructure/adapters/mailer`): prevents real mail; assertions inspect call count, template name, and payload (e.g. `linkUrl`).
- **`beforeEach`**: calls `resetDomainEvents()` and `registerModules(enabledModules)` so every test runs against the real wiring.
- **`soldOut()` / `shopper()` / `ask()`**: small helpers that create a zero-stock product, authenticate a customer role, or POST to `/stock-alerts` respectively.
- **`sentEvents()`**: reads `stock_alert.sent` rows from the outbox collection to assert the event was persisted.
- **`describe('POST /stock-alerts')`**: covers request creation, idempotency (double-ask), the per-user cap (`NODE_STOCK_ALERTS_MAX` via `withEnvironmentOverrides`), refusal when the product is buyable (shelf stock, open backorder, preorder with allowance), and 404 for inactive / soft-deleted products.
- **`describe('DELETE /stock-alerts/:productId and GET /stock-alerts')`**: covers cancel-then-retry (404), and list ordering / tenant isolation (only the caller's alerts, newest first).
- **`describe('the signal')`**: triggers restock via `inventoryService.receive()` + `settleOutboxNudges()`. Verifies exactly one mail, one outbox event, alert row deleted. Sub-cases: mail link URL from `NODE_FRONTEND_LINK_PRODUCT`, locked account (no mail, row deleted), unverified account (event persisted, no mail), and an account that verifies between ask and restock (mail sent).

## Relationships

- **`src/modules/stock-alerts/service.ts`** — `stockAlertService` is imported; the HTTP tests exercise it indirectly through the registered router.
- **`src/modules/stock-alerts/model.ts`** — `stockAlertModel` is queried in assertions (`countDocuments`) to verify DB state.
- **`src/modules/stock-alerts/events.ts`** — `STOCK_ALERT_SENT` constant is used to filter outbox rows in `sentEvents()`.
- **`src/kernel/registry.ts`** — `registerModules` wires all real modules for every test.
- **`src/kernel/events.ts`** — `resetDomainEvents` clears event state between tests; `emitDomainEvent` is available for direct emission.
- **`src/kernel/outbox.ts`** — `outboxEventModel` is queried for event assertions; `settleOutboxNudges` flushes pending outbox work before assertions.
- **`src/modules.ts`** — `enabledModules` is the list handed to the registry.
- **`src/modules/inventory/index.ts`** — the test imports `inventoryService` from this barrel and calls its methods (`.receive` to trigger restock, `.setBackorderLimit` to set up backorder/preorder fixtures).
- **`src/modules/inventory/services/index.ts`** — the actual implementation of `inventoryService` methods used above.
- **`src/modules/products/index.ts`** — `productService` and `PRODUCT_DELETED` are imported (available for product-side assertions).
- **`src/modules/products/tests/factories.ts`** — `createProduct`, `readProduct`, `saveProduct` build product fixtures.
- **`src/modules/users/repository.ts`** — `userRepository` (via `@modules/users/tests/factories`) is used to mutate user state (delete, verify) mid-test.
- **`src/infrastructure/adapters/mailer.ts`** — `enqueueEmail` is mocked; its calls are the primary assertion target for the signal path.
- **`src/infrastructure/runtime/database.ts`** — `withTransaction` is imported (available for transactional test setup).

## Notes

- The file does **not** mock the stock-alert service, product service, or inventory service—only the mailer. A regression in any of those modules will surface here.
- `settleOutboxNudges()` must be called after `inventoryService.receive()` to let the outbox processor emit the mail and event before assertions run; forgetting it produces silent async failures.
- The cap tests rely on `withEnvironmentOverrides` to set `NODE_STOCK_ALERTS_MAX`; the production default is not asserted here.
- The "unverified account" and "locked account" signal tests intentionally skip mail but still expect the alert row to be deleted and (for unverified) the domain event to be persisted—this is a product decision encoded in the assertions.
- `DAY_MS` is defined locally; if other test files need the same constant, it is not exported from a shared utility.
