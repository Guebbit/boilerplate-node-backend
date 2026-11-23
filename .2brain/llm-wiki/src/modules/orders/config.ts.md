---
source: src/modules/orders/config.ts
source_sha256: 27fb6bb1558dae3998720c6c2fe89fe2ffa9b8080c9e033610fbf91c130b4a58
context_sha256: 401045984b9718ef7ea391985f5b11a14734f99e0ddc2c7f66cc5dccc0521d86
generated_at: 2026-11-22T06:08:10.408841+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/config.ts

## Purpose
Defines the order module's runtime configuration: withdrawal window, PII and event-text retention, admin order line caps, CSV export limit, purchase-hold thresholds, and the module's one link template into the paired frontend. Every value is read per call through a getter rather than captured at import, so tests can vary them per case. A deployment changes a value with a restart.

## Key elements
- `ordersConfig`: `defineConfig` result named `orders`. Its shape declares these env-driven fields, with defaults and minimums:
  - `NODE_ADMIN_ORDER_MAX_LINES` (100, min 1)
  - `NODE_ADMIN_ORDER_MAX_LINE_QUANTITY` (99,999, min 1)
  - `NODE_WITHDRAWAL_PERIOD_DAYS` (30, min 21)
  - `NODE_ORDER_PII_DAYS_AFTER_GUARANTEE` (0, min 0)
  - `NODE_ORDER_PII_DAYS_UNDELIVERED` (540, min 1)
  - `NODE_ORDER_EVENT_TEXT_RETENTION_DAYS` (1095, min 1)
  - `NODE_ORDER_EXPORT_MAX_ROWS` (20,000, min 1)
  - `NODE_PURCHASE_HOLD_CANCEL_COUNT` (3, min 2)
  - `NODE_PURCHASE_HOLD_WINDOW_DAYS` (7, min 1)
  - `NODE_FRONTEND_LINK_ORDER` (text, defaults to `FRONTEND_LINK_RULES.links.order`)
- `maxAdminOrderLines()` / `maxAdminOrderLineQuantity()`: the configured cap, clamped to the API contract ceilings `createOrderBodyItemsMax` / `createOrderBodyItemsItemQuantityMax`.
- `withdrawalPeriodDays()`: the consumer withdrawal window in days.
- `orderPiiDaysAfterGuarantee()`: days a delivered order keeps the buyer after `conformityUntil`.
- `orderPiiDaysUndelivered()`: days a paid but undelivered order keeps the buyer, counted from `paidAt`.
- `orderEventTextRetentionDays()`: days a timeline row keeps staff-written free text, counted from the row's own instant.
- `orderExportMaxRows()`: row cap for one CSV export. Over it, the export answers 422.
- `orderPagePath(id)`: fills `{id}` in the `NODE_FRONTEND_LINK_ORDER` template with the URL-encoded id. It returns a bare path, not a URL.
- `orderFrontendLink({ locale, id })`: wraps `orderPagePath` with `frontendLink` to produce a locale-aware link to the frontend order page.
- `purchaseHoldCancelCount()` / `purchaseHoldWindowDays()`: the number of a buyer's cancellations, and the window in days they are counted in, that pause that buyer's checkout.

## Relationships
- Uses `src/infrastructure/config/define.ts` (`defineConfig`) and `src/infrastructure/config/fields.ts` (`int`, `text`) to declare the config.
- Uses `src/infrastructure/http/frontend-link.ts` for `frontendLink` and `FRONTEND_LINK_RULES`. That file does not know about `orders`, so the order link is owned here.
- The neighbor files under `src/modules/orders/` (`emails.ts`, `module.ts`, and `services/` including `crud`, `export`, `override`, `purchase-hold`, `retention`, `status`, `timeline`, `index`) are related through the dependency graph. By their names and the getters' purposes they likely consume these getters. `src/modules/delivery/services/notify.ts` is likely to use `orderPagePath` for the staff outbox notice, which the doc comment mentions. `scenarios/flows/shop-history.ts` is also a neighbor. The file content does not show how any of these use this file.

## Notes
- Follows the per-call-read pattern of `src/modules/inventory/config.ts`.
- The withdrawal minimum is 21 days, although the legal floor is 14 (Consumer Rights Directive Art. 9). The extra margin is there so a weekend or holiday roll-over never matters.
- The purchase-hold minimum count is 2, because one cancellation is an ordinary change of mind.
- The event-text retention has its own clock. The order's clock starts only at erasure or inactivity, so a live customer's staff text would otherwise never expire.
- An admin cap set above the contract ceiling has no effect, because the schema refuses first.
- Out of scope here: shop identity, currency and return address (in `shop`), and VAT rates (resolved by `products`; `orders` only freezes the number).
- `orderPagePath` uses a function replacer so a `$&` in an id is treated as text and not as a replacement pattern.
