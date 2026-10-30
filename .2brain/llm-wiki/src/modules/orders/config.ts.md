---
source: src/modules/orders/config.ts
sha256: c1e19c0a557edddc53152438d176163a02ce3d02dbf21a7c13e515c355d97eee
generated_at: 2026-10-29T04:37:47.916772+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/config.ts

## Purpose

Defines the orders module's tunable rules—withdrawal window, data-retention periods, line/quantity caps, purchase-hold thresholds, and the link into the paired frontend. Every value is read per call (not captured at import) so tests can vary them; a deployment change takes effect on restart. Shop identity, currency, and VAT rates deliberately live elsewhere.

## Key elements

- **`ordersConfig`** — the single `defineConfig` object (`name: 'orders'`) holding all `NODE_*` env-backed settings with typed defaults and minimums.
- **`maxAdminOrderLines()`** — effective line cap for admin-created orders: `min(config, schema ceiling)`.
- **`maxAdminOrderLineQuantity()`** — effective per-line quantity cap, same ceiling logic.
- **`withdrawalPeriodDays()`** — consumer withdrawal window (default 30, min 21).
- **`orderPiiDaysAfterGuarantee()`** — PII retention after the conformity window closes (default 0).
- **`orderPiiDaysUndelivered()`** — PII retention for a paid-but-undelivered order from `paidAt` (default 540).
- **`orderEventTextRetentionDays()`** — retention for free-text on timeline rows, clocked from the row's own instant (default 1095).
- **`orderExportMaxRows()`** — max rows per CSV export; exceeding it yields 422 (default 20 000).
- **`orderFrontendLink({ locale, id })`** — resolves the order page URL in the paired frontend via `frontendLink`.
- **`purchaseHoldCancelCount()`** — number of in-window cancellations that trigger a checkout hold (min 2).
- **`purchaseHoldWindowDays()`** — rolling window (days) in which those cancellations are counted.

## Relationships

- **`src/infrastructure/config/define.ts`** / **`fields.ts`** — provides `defineConfig`, `int`, and `text`; the sole structural dependency of this file.
- **`src/infrastructure/http/frontend-link.ts`** — supplies `frontendLink` and `FRONTEND_LINK_RULES`; consumed by `orderFrontendLink`.
- **`src/modules/orders/services/status.ts`**, **`retention.ts`**, **`timeline.ts`**, **`export.ts`**, **`purchase-hold.ts`**, **`override.ts`**, **`crud.ts`** — each consumes one or more of the exported getters (withdrawal, PII days, text retention, row cap, hold thresholds, line/quantity caps).
- **`src/modules/orders/emails.ts`** — calls `orderFrontendLink` to embed the order URL in outbound email.
- **`src/modules/orders/module.ts`** — registers the module; transitively depends on this config.
- **`src/modules/delivery/services/notify.ts`** — reads withdrawal/retention values relevant to delivery notifications.
- **`scenarios/flows/shop-history.ts`** — test scenario that varies these config values per case.

## Notes

- **Per-call reads:** the pattern (borrowed from `inventory/config.ts`) means you cannot snapshot a value at module load and expect it to change in tests.
- **Ceiling enforcement:** `maxAdminOrderLines` / `maxAdminOrderLineQuantity` silently cap at the API schema's max; setting the env var above that ceiling has no effect—the schema rejects first.
- **Withdrawal minimum is 21, not 14:** the legal floor (Consumer Rights Directive Art. 9) is 14 days; 21 is chosen so a weekend/holiday rollover can never shorten the effective window below the legal minimum.
- **VAT and shop identity are explicitly excluded** from this file by design (see `products` and `shop` configs respectively).
- **`NODE_ORDER_PII_DAYS_AFTER_GUARANTEE` defaults to 0** — meaning PII is erased immediately once the conformity window ends unless the operator opts in.
