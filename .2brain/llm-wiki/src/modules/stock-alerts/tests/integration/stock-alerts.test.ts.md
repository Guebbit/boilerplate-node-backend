---
source: src/modules/stock-alerts/tests/integration/stock-alerts.test.ts
sha256: 95195c7cc35c131d01591f5d274e1eb62c442ae423e72ea10ce91ffb1fa7ae44
generated_at: 2026-11-08T08:30:33.855888+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stock-alerts/tests/integration/stock-alerts.test.ts

## Purpose

Integration tests for the back-in-stock alert feature, exercising the full HTTP surface (POST, GET, DELETE) and the fulfilment signal through the real module wiring. Verifies requesting, refusal rules, cancellation, listing, email dispatch, outbox events, idempotency, and the hourly sweep for release-date transitions.

## Key elements

- **`soldOut()`** – helper that creates a product with `onHand: 0` and returns its id string.
- **`shopper()`** – authenticates a `customer` role, returning bearer + user id.
- **`sentEvents()`** – reads `stock_alert.sent` payloads from the outbox collection.
- **`unreleased()`** – creates a stocked product with a future `releaseDate`.
- **`letTheDatePass(productId)`** – mutates the product's `releaseDate` to the past directly (no domain event), simulating time elapsing.
- **`describe('POST /stock-alerts')`** – success + idempotency (duplicate request returns 200, single document), refusal (409 `STOCK_ALERT_PRODUCT_BUYABLE`) for shelf stock / open backorder / preorder allowance, and 404 for hidden or soft-deleted products.
- **`describe('DELETE … and GET …')`** – cancels own request (200 then 404), lists only the caller's alerts newest-first.
- **`describe('the signal')`** – fulfilment via `inventoryService.receive`: one email, one `STOCK_ALERT_SENT` outbox row, document deleted; idempotent on double signal; no mail for locked/deleted accounts; no mail if alert was already cancelled; backorder switch toggled by an editor also triggers fulfilment.
- **`describe('the hourly sweep')`** – `stockAlertService.sweepBuyable` resolves alerts whose release date has passed; a second sweep is a no-op.
- **`jest.mock('@infrastructure/adapters/mailer')`** – replaces `enqueueEmail` with a spy so assertions count calls without sending mail.
- **`beforeEach`** – calls `resetDomainEvents()` and `registerModules(enabledModules)` so the real registration path in `module.ts` is exercised.

## Relationships

- **`src/modules/stock-alerts/service.ts`** – invokes `stockAlertService.onBuyableAgain` and `stockAlertService.sweepBuyable` directly for signal and sweep tests.
- **`src/modules/stock-alerts/model.ts`** – uses `stockAlertModel.countDocuments()` to assert persistence state.
- **`src/modules/stock-alerts/events.ts`** – references the `STOCK_ALERT_SENT` constant when querying the outbox.
- **`src/modules/inventory/index.ts` / `services/index.ts`** – drives the "buyable again" transition via `inventoryService.receive` and `setBackorderLimit`.
- **`src/infrastructure/adapters/mailer.ts`** – `enqueueEmail` is mocked; tests assert call count, template name (`stock-alerts.back-in-stock`), and `linkUrl`.
- **`src/kernel/outbox.ts`** – reads `outboxEventModel` rows and calls `settleOutboxNudges()` to flush pending outbox entries.
- **`src/kernel/events.ts`** – `resetDomainEvents()` clears the in-memory domain-event queue between tests.
- **`src/kernel/registry.ts`** – `registerModules` wires the real module graph so HTTP routes and inter-module calls work.
- **`src/modules.ts`** – supplies the `enabledModules` list registered in `beforeEach`.
- **`src/modules/products/tests/factories.ts`** – `createProduct`, `readProduct`, `saveProduct` seed and mutate fixture products.
- **`src/modules/users/tests/factories.ts`** – `userRepository` is used to soft-delete a user (simulating account deletion) before the signal fires.
- **`tests/support/callers.ts`** – provides `testCallerContext` passed to `inventoryService.receive`.
- **`src/infrastructure/runtime/database.ts`** – `withTransaction` imported (likely used in the truncated sweep section).

## Notes

- The mailer is **fully mocked**; no email infrastructure is needed. Assertions rely on `mockEnqueueEmail` call args.
- `letTheDatePass` bypasses the normal save-and-event path to simulate wall-clock time; this is intentional and differs from production behaviour where no event fires for time alone.
- Idempotency is verified at two levels: double `onBuyableAgain` calls and double `inventoryService.receive` — both must result in exactly one email.
- The "locked account" test sets `deletedAt`, `deletedBy`, and `purgeAt` on the user to simulate a pending-deletion account; the signal still deletes the alert document but skips the mail.
- `settleOutboxNudges()` must be awaited after any action that enqueues outbox work, or assertions on `sentEvents()` will miss rows.
- The file ends mid-test (truncated); the sweep `describe` block likely contains additional assertions beyond the visible portion.
