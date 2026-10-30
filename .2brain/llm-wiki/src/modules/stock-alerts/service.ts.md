---
source: src/modules/stock-alerts/service.ts
sha256: 28212d287b9c8bd31370782a90bc56a9af86d76c9cd7a1ba980e641cef5e2977
generated_at: 2026-10-29T05:59:36.576675+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stock-alerts/service.ts

## Purpose

Service layer for back-in-stock alerts. It orchestrates the full lifecycle of a buyer's "notify me" request—creation, cancellation, listing, deletion on account/product removal—and answers those requests (one email + one inbox row) when a product becomes buyable again. It is the single module through which controllers, event handlers, and scheduled sweeps interact with stock alerts.

## Key elements

- **`stockAlertService`** – the sole export; a flat object bundling all public operations.
- **`list(userId)`** – fetches a user's alerts newest-first and shapes them via the presenter.
- **`ask(userId, productId)`** – creates a request; rejects 404 if product missing, 409 if the product is already buyable (idempotent on repeat ask).
- **`cancel(userId, productId)`** – removes the caller's request; 404 if absent.
- **`exportRows(userId)`** – returns raw alert items for the personal-data export.
- **`removeByUserId(userId, session)`** – bulk-delete inside the account hard-delete transaction.
- **`removeByProductId(productId)`** – bulk-delete when a product leaves the catalogue.
- **`titleFor(titles, locale)`** – resolves a product title by the buyer's locale, then default, then any available.
- **`answerOne(alert, titles)`** – atomic delete + `STOCK_ALERT_SENT` outbox announcement in one transaction; then mails the buyer. Returns `false` if the alert was already gone (idempotency guard).
- **`mailBuyer(userId, productId, titles)`** – sends the back-in-stock email; skips locked/erased accounts; logs (never throws) on failure.
- **`onBuyableAgain(productId)`** – answers every waiting alert for a product, sequentially.
- **`sweepBuyable(now)`** – periodic pass that answers alerts for products whose buyable window opened without a write (e.g., preorder release dates). Returns count of products answered.

## Relationships

- **`@kernel/outbox`** – `answerOne` calls `announceInTransaction` to atomically pair the alert deletion with the `STOCK_ALERT_SENT` inbox event.
- **`@infrastructure/adapters/mailer`** – `mailBuyer` calls `enqueueEmail` (fire-and-forget; never rejects).
- **`@infrastructure/adapters/logger`** – logs errors if the user lookup or email step fails in `mailBuyer`.
- **`@infrastructure/http/response`** – `ask` and `cancel` return `generateSuccess` / `generateReject` shapes.
- **`@infrastructure/http/frontend-link`** – builds the absolute product URL embedded in the email.
- **`@infrastructure/i18n`** – `t()` for user-facing error strings; `getDefaultLocale()` as locale fallback in `titleFor` and `mailBuyer`.
- **`@modules/products`** – `productService.findPublicById` (ask, sweep), `productService.titlesById` (onBuyableAgain), `isBuyable` (ask, sweep), `productPagePath` (email link).
- **`@modules/stock-alerts/controllers/delete-stock-alert.ts`** – controller that delegates to `stockAlertService.cancel`.
- **`@modules/notifications/tests/integration/events.test.ts`** – integration tests asserting the `STOCK_ALERT_SENT` outbox event emitted by `answerOne`.
- **`@modules/delivery/tests/unit/fulfillment.test.ts`** – unit tests exercising the buyable-signal path that ultimately calls `onBuyableAgain`.

## Notes

- **Idempotency via delete-then-act:** `answerOne` uses the repository `deleteById` as a guard; a concurrent cancellation or redelivered signal finds nothing and sends nothing. No explicit locking is used.
- **Mail is best-effort:** after the transaction commits, a mail failure is logged and swallowed—the inbox row already stands as the durable record.
- **`sweepBuyable` is the only path for time-based buyability:** preorders that hit their release date never trigger a write, so the event-driven `onBuyableAgain` path never fires for them.
- **Sequential answering:** `onBuyableAgain` processes alerts one-by-one (each its own transaction) rather than batching, to keep per-row failure isolation.
- **Locked-account check:** `isAuthenticatable` (from `@modules/users`) gates mail delivery, so banned or pending-deletion accounts receive no notification.
