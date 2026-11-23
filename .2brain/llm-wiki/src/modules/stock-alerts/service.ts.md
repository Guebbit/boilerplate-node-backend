---
source: src/modules/stock-alerts/service.ts
source_sha256: 7ff7f5e70e9d5bbf0abdde7fec7011b5a747175f4ec48f1f29707ea9eeea98a9
context_sha256: dd52b69b78882b786f9c5f17c107b146d74026b9e4a0bea45283a776c79c8db3
generated_at: 2026-11-22T07:55:41.494717+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/stock-alerts/service.ts

## Purpose
Business logic for "back-in-stock" requests. Buyers can ask to be notified when an `out_of_stock` product becomes orderable again, cancel the request, list their own requests, and export them. When the product is no longer `out_of_stock`, each waiting request gets one email and one inbox row, and the request is then deleted. Clicking "Notify me" counts as consent for that single mail only.

## Key elements
- `stockAlertService` (the only export) bundles the handlers below.
- `list(userId)` returns the user's requests via `findByUserId` and `presentStockAlerts`, newest first.
- `ask(userId, productId)`:
  - Returns 404 if the product is not found.
  - Returns 409 `STOCK_ALERT_PRODUCT_BUYABLE` unless inventory reports `out_of_stock`.
  - Returns 409 `STOCK_ALERT_LIMIT_REACHED` when the repository reports the cap (`NODE_STOCK_ALERTS_MAX`) for a new product.
  - Asking twice is the same request.
  - On success it returns the refreshed list.
- `cancel(userId, productId)` returns 404 if nothing was removed, otherwise the refreshed list.
- `exportRows(userId)` returns the items of `list`, for the personal-data export.
- `removeByUserId(userId, session)` deletes an account's requests inside the caller's hard-delete transaction.
- `removeByProductId(productId)` deletes the requests for a product removed from the catalogue.
- `answerWaiting(productId)` loads the waiting requests and the product titles, then answers them one at a time with `answerOne`.
- `sweepBuyable()` is the periodic pass (documented as every five minutes). It reads `distinctProductIds`, then checks availability in batches of `SWEEP_BATCH` (100). For each product that is not `out_of_stock` it calls `answerWaiting`. It returns the number of products answered.
- Internal helpers:
  - `answerOne` deletes the request and announces `STOCK_ALERT_SENT` in one transaction, then mails.
  - `mailBuyer` sends the email.
  - `titleFor` picks the product title by the buyer's locale, then the default locale, then any title.

## Relationships
- **Inventory** (`@modules/inventory`): the source of `out_of_stock` state for both `ask` and the sweep.
- **Products** (`@modules/products`): existence check, localized titles, and `productPagePath` for the product link in the mail.
- **Outbox** (`@kernel/outbox` `announceInTransaction`): deletes the request and records the `STOCK_ALERT_SENT` event atomically. The payload carries `userId`, `productId` and `titles`, and `aggregateId` is the user.
- **Mailer** (`enqueueEmail`) and `backInStockEmail` (`./emails`): send the mail.
- **Frontend link** (`frontendLink`): builds the localized product URL.
- **Response helpers** (`generateSuccess`, `generateReject`): build the API results.
- **i18n** (`t`, `getDefaultLocale`): localized messages and the default locale.
- **Logger**: records mail failures.
- **Repository and presenter** (`./repository`, `./presenter`): persistence and view shaping.
- This module also imports `@modules/users` (`getById`, `isAuthenticatable`) to decide whether a buyer can be mailed; it is not in the neighbor list above.

## Notes
- The delete in `answerOne` is the idempotency guard. A request that was canceled meanwhile, or whose signal is redelivered, finds nothing to delete, so no mail is sent.
- Mail is skipped silently for these buyers, who get only the inbox row:
  - the account is missing (erased);
  - the account is locked (banned, or in its deletion grace period);
  - the address is unverified (`verifiedAt` unset).
- A mail failure is only logged. The request is already deleted and the inbox row stands.
- Requests are answered sequentially, each in its own transaction.
- The sweep queries inventory directly with no caller, so no permissions are judged. A hidden or removed product reads `out_of_stock`.
- `sweepBuyable` counts products, not requests.
