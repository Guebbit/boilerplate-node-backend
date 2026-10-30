---
source: src/modules/stock-alerts/tests/integration/stock-alerts.test.ts
sha256: 596e29f733dea5d6079566570d2b332d930c24bfcc5299a7f25593550452b1ba
generated_at: 2026-10-29T06:00:08.241824+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stock-alerts/tests/integration/stock-alerts.test.ts

## Purpose

Integration test for the stock-alerts module exercising the real HTTP API and service wiring end-to-end. It verifies the full lifecycle of a back-in-stock alert—creation, idempotency, refusal while the product is buyable, cancellation, listing, the buyable-again signal (mail + event + deletion), and the hourly sweep for release-date transitions—using registered real modules rather than isolated unit mocks.

## Key elements

- **`jest.mock('@infrastructure/adapters/mailer')`** — replaces `enqueueEmail` with a jest mock so mail side-effects can be asserted without sending.
- **`beforeEach`** — calls `resetDomainEvents()` and `registerModules(enabledModules)` so every test runs against the real module wiring.
- **`soldOut()` / `shopper()` / `sentEvents()`** — small helpers: create a zero-stock product, authenticate a customer, and read `STOCK_ALERT_SENT` payloads from the outbox.
- **`describe('POST /stock-alerts')`** — asserts 200 + idempotent re-request, 409 `STOCK_ALERT_PRODUCT_BUYABLE` for shelf/backorder/preorder products, and 404 for hidden or soft-deleted products.
- **`describe('DELETE /stock-alerts/:productId and GET /stock-alerts')`** — asserts cancel-then-404, and that GET returns only the caller's alerts in newest-first order.
- **`describe('the signal')`** — triggers `inventoryService.receive` (or `stockAlertService.onBuyableAgain`) to fire the buyable-again path; asserts one mail, one outbox event, model row deleted, no duplicate on double-delivery, no mail for locked accounts, and handling of the `allowBackorder` toggle.
- **`unreleased()` / `letTheDatePass()`** — helpers for the sweep scenario: a product with stock but a future `releaseDate`, then moved into the past directly via `saveProduct`.
- **`describe('the hourly sweep')`** — calls `stockAlertService.sweepBuyable` twice; asserts the first pass resolves one alert and the second sends nothing.

## Relationships

- **`src/modules/stock-alerts/service.ts`** — `stockAlertService` is called directly for `onBuyableAgain` and `sweepBuyable` (the sweep path has no HTTP endpoint).
- **`src/modules/stock-alerts/model.ts`** — `stockAlertModel` is queried to assert row counts and state.
- **`src/modules/stock-alerts/events.ts`** — `STOCK_ALERT_SENT` is matched against outbox rows.
- **`src/infrastructure/adapters/mailer.ts`** — `enqueueEmail` is mocked; call count and arguments (template name, `linkUrl`) are the primary assertions for the signal.
- **`src/kernel/outbox.ts`** — `outboxEventModel` reads persisted events; `settleOutboxNudges()` flushes pending outbox work after stock changes.
- **`src/kernel/events.ts`** — `resetDomainEvents()` clears in-memory domain events between tests.
- **`src/kernel/registry.ts`** — `registerModules` wires all enabled modules so routing and inter-module calls work.
- **`src/modules.ts`** — `enabledModules` provides the module list to register.
- **`src/modules/inventory/index.ts`** — `inventoryService.receive` and `.setBackorderLimit` are the trigger points for the buyable-again signal.
- **`src/modules/products/tests/factories.ts`** — `createProduct`, `readProduct`, `saveProduct` build test fixtures.
- **`src/modules/users/tests/factories.ts`** — `userRepository` is used to simulate a locked/deleted account.
- **`tests/support/callers.ts`** — `testCallerContext` supplies the caller identity for direct service calls.
- **`src/infrastructure/runtime/database.ts`** — `withTransaction` is imported (available for transactional assertions).

## Notes

- Only the mailer is mocked; the database, outbox, event bus, and all module wiring are real. This means tests are slower but catch wiring regressions (e.g., a missing route registration or an unregistered event handler).
- `settleOutboxNudges()` must be called after any stock change or `onBuyableAgain` call; without it the outbox row is persisted but the handler (mail + model deletion) has not run yet.
- The "link to product page" test uses `withEnvironmentOverrides` to inject `NODE_FRONTEND_LINK_PRODUCT`—the link format is deployment-configurable, not hardcoded.
- The sweep test calls `stockAlertService.sweepBuyable(new Date())` directly because there is no HTTP endpoint for the sweep; it is an internal periodic task.
- `it.each` is used for the refusal and 404 matrices; the `%s` placeholder in the test name makes failures self-explanatory in output.
