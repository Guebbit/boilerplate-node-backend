---
source: src/modules/stock-alerts/tests/integration/stock-alerts.test.ts
source_sha256: 3591ac4d26ba19081b01e4bf6ff0b38498fce1ac01f6aaded3fe2e0aed20e7e8
context_sha256: d1053081c446070abd5707f8c08f4e32e9e730f5fd1fc8b8e3273b158d19052c
generated_at: 2026-11-22T07:56:14.651541+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/stock-alerts/tests/integration/stock-alerts.test.ts

## Purpose
Integration test suite for the stock-alerts module's back-in-stock requests. It exercises the module over HTTP with the real module wiring (`registerModules(enabledModules)`), so the wiring in `module.ts` is part of what is tested. It covers asking, the refusal unless the product is out of stock, cancelling and listing, and the sweep that answers a waiting request with one mail and then deletes it.

## Key elements
- **Mocked mailer**: `@infrastructure/adapters/mailer` is replaced with a `jest.fn()` `enqueueEmail` (`mockEnqueueEmail`), and the cases assert which mail was enqueued.
- **Setup**: `setupTestDb()` provides the database. `beforeEach` calls `resetDomainEvents()` and `registerModules(enabledModules)`. `afterEach` calls `jest.clearAllMocks()`.
- **Helpers**:
  - `soldOut()` creates a product with `onHand: 0` and returns its id.
  - `shopper()` signs in via `authenticateAsRole('customer')`.
  - `sentEvents()` reads the `STOCK_ALERT_SENT` rows from `outboxEventModel` and returns their payloads.
  - `ask(bearer, productId)` posts to `/stock-alerts`.
  - `DAY_MS` is one day in milliseconds.
- **`POST /stock-alerts`**:
  - Asking twice returns 200 both times and stores a single request.
  - **Cap**: with `NODE_STOCK_ALERTS_MAX=2`, a new product past the cap gets a 409 `STOCK_ALERT_LIMIT_REACHED`. Re-asking for an already-held product still gets 200.
  - **Buyable products**: a product with shelf units, an open backorder, or a preorder with allowance left gets a 409 `STOCK_ALERT_PRODUCT_BUYABLE` and nothing is written.
  - **Missing, hidden or soft-deleted products**: each gets a 404.
- **`DELETE /stock-alerts/:productId` and `GET /stock-alerts`**:
  - Cancelling returns 200 the first time and 404 the second time.
  - The list contains only the caller's own requests, newest first.
- **Sweep after a restock**: restocks via `inventoryService.receive(...)`, then calls `stockAlertService.sweepBuyable()`. Cases covered:
  - A waiting request gets exactly one mail (template `stock-alerts.back-in-stock`), one `stock_alert.sent` event, and the request is deleted. A second restock and sweep sends nothing more.
  - The mail link uses the configured `NODE_FRONTEND_LINK_PRODUCT` template (e.g. `shop/item-{id}`).
  - A locked (soft-deleted) account gets no mail, and its request is still deleted.
  - An unverified account gets the event but no mail, and its request is deleted.
  - Further cases follow (e.g. an account that verifies between asking and the restock gets mailed), but the visible content stops there.

## Relationships
- `@infrastructure/adapters/mailer`: mocked, so enqueued mails can be asserted.
- `@kernel/registry` and `src/modules.ts`: `registerModules(enabledModules)` wires the real modules.
- `@kernel/events`: `resetDomainEvents` and `emitDomainEvent` are imported.
- `@kernel/outbox`: `outboxEventModel` is queried for sent events. `settleOutboxNudges` is also imported.
- `@modules/inventory`: `inventoryService` is used to restock products and to set backorder limits when building backorder and preorder fixtures.
- `@modules/products` and `products/tests/factories`: `createProduct` builds fixtures. `readProduct`, `saveProduct`, `PRODUCT_DELETED` and `productService` are also imported.
- `../../service`, `../../model` and `../../events`: the code under test (`stockAlertService`, `stockAlertModel`, `STOCK_ALERT_SENT`).
- `@modules/users`: `userRepository` is used to mark an account deleted (`updateMany`).
- `@infrastructure/runtime/database`: `withTransaction` is imported.
- `@tests/*` helpers: `setup-test-db`, `http` (`api`, `authenticateAsRole`), `callers` (`testCallerContext`) and `environment` (`withEnvironmentOverrides`).

## Notes
- Environment-dependent cases (cap, frontend link) use `withEnvironmentOverrides` rather than mutating `process.env` directly.
- The header comment points to `src/modules/stock-alerts/model.ts` for further context on the sweep.
