---
source: src/modules/stock-alerts/service.ts
sha256: 9378fc443774b137cfd8386275cb9e9c672ed8a8280ad7a11d64ab38dc6465ab
generated_at: 2026-11-08T08:30:00.636341+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stock-alerts/service.ts

## Purpose

Core service for back-in-stock alerts. It manages the full lifecycle of a "notify me" request — create, cancel, list, and delete — and handles the "buyable again" signal by sending exactly one email and one inbox row per waiting request, then deleting the request. The click on "Notify me" is the buyer's sole consent for that single mail; nothing else is ever sent on that request.

## Key elements

- **`stockAlertService`** (export) — the single module handle bundling all public operations.
- **`list(userId)`** — fetches the user's alerts (newest first) and shapes them via `presentStockAlerts`.
- **`ask(userId, productId)`** — creates a request. Rejects 404 if product is missing, 409 if the product is already buyable. Idempotent: asking twice is the same request.
- **`cancel(userId, productId)`** — removes the caller's request; 404 if none exists.
- **`exportRows(userId)`** — returns raw items for personal-data export.
- **`removeByUserId(userId, session)`** — cascading delete inside a hard-delete transaction.
- **`removeByProductId(productId)`** — cascading delete when a product leaves the catalogue.
- **`titleFor(titles, locale)`** — resolves a product title with locale → default-locale → any-key fallback.
- **`answerOne(alert, titles)`** — deletes the request and emits the `STOCK_ALERT_SENT` inbox event in one transaction, then mails the buyer. The successful delete is the idempotency guard.
- **`mailBuyer(userId, productId, titles)`** — resolves the user, skips locked/erased accounts, builds the email via `backInStockEmail`, and calls `enqueueEmail`. Failures are logged, never thrown.
- **`onBuyableAgain(productId)`** — answers all waiting requests for one product, sequentially (one transaction each).
- **`sweepBuyable(now)`** — periodic sweep that answers preorders whose release date has passed (the "buyable again" signal only fires on a write, so this pass covers date-based preorders).

## Relationships

- **`@infrastructure/i18n`** — `t()` for user-facing error strings; `getDefaultLocale()` for locale fallback in emails and titles.
- **`@infrastructure/adapters/logger`** — error logging in the `mailBuyer` catch path.
- **`@infrastructure/adapters/mailer`** — `enqueueEmail` delivers the back-in-stock email (fire-and-forget; never rejects).
- **`@infrastructure/http/frontend-link`** — builds the product-page URL embedded in the email body.
- **`@infrastructure/http/response`** — `generateSuccess` / `generateReject` shape HTTP responses for `ask`, `cancel`, `list`.
- **`@kernel/outbox`** — `announceInTransaction` pairs the alert-row delete with the `STOCK_ALERT_SENT` inbox event atomically.
- **`@modules/products`** (`src/modules/products/index.ts`) — `isBuyable` (gate for `ask` and `sweepBuyable`), `productPagePath` (email link), `productService.findPublicById` / `.titlesById` (product lookup).
- **`./repository`** — all persistence (`findByUserId`, `ask`, `cancel`, `deleteById`, `findByProductId`, `distinctProductIds`, `deleteByUserId`, `deleteByProductId`).
- **`./emails`** — `backInStockEmail` builds the email template and data.
- **`./events`** — `STOCK_ALERT_SENT` constant used as the outbox event name.
- **`./presenter`** — `presentStockAlerts` maps stored alerts to the response shape.
- **`src/modules/stock-alerts/controllers/delete-stock-alert.ts`** — consumes `stockAlertService.cancel` (or a related delete path) to handle the HTTP delete endpoint.
- **`src/modules/shop-tasks/tests/integration/notices.test.ts`** and **`src/modules/delivery/tests/unit/fulfillment.test.ts`** — integration/unit tests that exercise the alert lifecycle through this service.

## Notes

- **Idempotency via delete:** `answerOne` relies on the row-delete succeeding as the guard. A re-delivered "buyable again" signal or a concurrent cancel simply finds no row and sends nothing.
- **Sequential processing:** `onBuyableAgain` answers alerts one-by-one (`for…await`), each in its own transaction, to avoid row-lock contention.
- **`sweepBuyable` necessity:** Preorders whose release date passes are never *written* to, so no "buyable again" signal fires. This sweep is the only path that answers them.
- **`enqueueEmail` never rejects:** the eslint-disable comment and the module docstring both confirm it logs its own failure. The `void` operator is intentional.
- **Locked accounts skipped:** `isAuthenticatable` gates the mail step; banned or deletion-grace accounts get the inbox row (already committed) but no email.
- **Single-consent contract:** the module docstring makes explicit that the one mail per request is the full scope of the buyer's consent; no follow-up or reminder is sent.
