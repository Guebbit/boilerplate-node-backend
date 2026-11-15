---
source: src/modules/stock-alerts/service.ts
sha256: 17fd076242b96fceb2aeeadb7d0c48698fbae75f068be125ab84f42c96433bb8
generated_at: 2026-11-14T22:04:34.062285+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stock-alerts/service.ts

## Purpose

Service layer for the back-in-stock (stock-alerts) feature. It exposes the buyer-facing operations (ask, cancel, list, export, hard-delete) and the "buyable again" reaction that answers every pending request with exactly one email and one inbox row, then deletes the request. The single click on "Notify me" is the buyer's sole consent for that one notification; no further mail is ever sent on the same request.

## Key elements

- **`stockAlertService`** (export) — the module's single service handle bundling all public functions.
- **`list`** — returns a user's own requests (newest first) via `stockAlertRepository.findByUserId` → `presentStockAlerts`.
- **`ask`** — registers a back-in-stock request. Rejects 404 if the product is missing, 409 (`STOCK_ALERT_PRODUCT_BUYABLE`) if the product is already buyable, or 409 (`STOCK_ALERT_LIMIT_REACHED`) if the per-account cap is hit.
- **`cancel`** — removes the caller's request; 404 if not found.
- **`exportRows`** — raw stored items for the personal-data (GDPR) export.
- **`removeByUserId`** — deletes all requests inside the caller's hard-delete Mongoose transaction (`ClientSession`).
- **`removeByProductId`** — cascades when a product leaves the catalogue.
- **`answerOne`** — atomically deletes the alert row and announces the `STOCK_ALERT_SENT` inbox event in one transaction (`announceInTransaction`); only then calls `mailBuyer`. The delete acts as an idempotency guard.
- **`mailBuyer`** — resolves the user, skips if the account is erased/banned/unverified, builds a localized email via `backInStockEmail` and enqueues it with `enqueueEmail`.
- **`onBuyableAgain`** — fetches all waiting alerts for a product, resolves titles, and calls `answerOne` sequentially (each in its own transaction).
- **`sweepBuyable`** — periodic sweep: iterates distinct product IDs, checks `isBuyable` against the current instant, and calls `onBuyableAgain`. Exists because a preorder whose release date passes produces no write event.
- **`titleFor`** — locale-aware product-name picker: buyer's locale → `getDefaultLocale()` → any available value → `''`.

## Relationships

- **`@infrastructure/i18n`** (`t`, `getDefaultLocale`) — localizes user-facing error messages and provides the fallback locale for product titles.
- **`@infrastructure/adapters/logger`** — logs an error in `mailBuyer` when the user lookup or email construction throws.
- **`@infrastructure/adapters/mailer`** (`enqueueEmail`) — fires the actual back-in-stock email from `mailBuyer`.
- **`@infrastructure/http/frontend-link`** (`frontendLink`) — builds the product URL (locale-aware) embedded in the email body.
- **`@infrastructure/http/response`** (`generateSuccess`, `generateReject`) — shapes the HTTP responses for `ask` and `cancel`.
- **`@kernel/outbox`** (`announceInTransaction`) — creates the `STOCK_ALERT_SENT` inbox row atomically with the alert-row deletion in `answerOne`.
- **`@modules/products`** (`isBuyable`, `productPagePath`, `productService`) — checks buyability in `ask`/`sweepBuyable`, resolves product titles, and provides the page path for the email link.

## Notes

- **Idempotency guard:** `answerOne` deletes the row *before* mailing. A redelivered signal or a concurrent cancel finds nothing to delete and sends nothing — no double-mail is possible.
- **Mail eligibility:** `mailBuyer` silently skips users who are erased, non-authenticatable (banned or in deletion grace), or unverified (`verifiedAt` falsy). The inbox row still stands in those cases.
- **`enqueueEmail` never rejects** — failures are logged internally; the `void` + eslint-disable is intentional.
- **`sweepBuyable` is the only path that answers preorders** whose release date passed without a write. It is safe to run repeatedly: answered alerts are already deleted.
- **Sequential processing:** `onBuyableAgain` awaits each `answerOne` in order, giving each request its own transaction rather than batching. This keeps partial-failure isolation per row.
