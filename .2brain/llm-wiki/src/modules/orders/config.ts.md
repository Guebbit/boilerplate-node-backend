---
source: src/modules/orders/config.ts
sha256: 0652198afc161506681a0baed2beeaf73ad66163cc7a904dba6b93d7872b09c5
generated_at: 2026-11-08T06:45:37.239079+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/config.ts

## Purpose

Centralises every tunable rule that governs the orders module — line caps, withdrawal window, PII retention periods, export limits, purchase-hold thresholds, and the one frontend link path — behind per-call getter functions so tests can vary any value without re-importing. Shop identity, currency, and return address intentionally live in `shop`; VAT rates are resolved by `products`. A deployment changes a value via restart.

## Key elements

- **`ordersConfig`** — the `defineConfig` instance (`name: 'orders'`) holding nine `int`/`text` fields. Not meant for direct external access; the getters below are the public surface.
- **`maxAdminOrderLines()`** — returns the lower of `NODE_ADMIN_ORDER_MAX_LINES` and the API contract ceiling (`createOrderBodyItemsMax`).
- **`maxAdminOrderLineQuantity()`** — same min-with-ceiling pattern for per-line quantity.
- **`withdrawalPeriodDays()`** — consumer withdrawal window (min 21 to absorb weekend/holiday roll-over).
- **`orderPiiDaysAfterGuarantee()`** / **`orderPiiDaysUndelivered()`** — PII retention clocks for delivered vs. undelivered orders.
- **`orderEventTextRetentionDays()`** — independent retention for free-text on timeline rows (its own clock, not the order's).
- **`orderExportMaxRows()`** — CSV export cap; exceeding it yields 422.
- **`orderPagePath(id)`** — fills `{id}` into the configured template with `encodeURIComponent`; returns a bare path (not a full URL). Uses a function replacer so a literal `$&` in the id stays literal.
- **`orderFrontendLink({locale, id})`** — wraps `orderPagePath` in `frontendLink` to produce a full URL for the paired frontend.
- **`purchaseHoldCancelCount()`** / **`purchaseHoldWindowDays()`** — thresholds that pause a buyer's checkout.

## Relationships

- **`src/infrastructure/config/define.ts`** — supplies `defineConfig`, the factory that produces `ordersConfig`.
- **`src/infrastructure/config/fields.ts`** — supplies the `int` and `text` field descriptors used in the shape.
- **`src/infrastructure/http/frontend-link.ts`** — supplies `frontendLink` (used by `orderFrontendLink`) and `FRONTEND_LINK_RULES` (default template for `NODE_FRONTEND_LINK_ORDER`). The link path is owned *here* because the infrastructure layer does not know the orders module exists.
- **`src/modules/orders/services/crud.ts`** — consumes `maxAdminOrderLines` / `maxAdminOrderLineQuantity` when validating admin-created orders.
- **`src/modules/orders/services/export.ts`** — calls `orderExportMaxRows` to bound CSV output.
- **`src/modules/orders/services/retention.ts`** — reads the PII and event-text retention getters to schedule erasure.
- **`src/modules/orders/services/purchase-hold.ts`** — reads `purchaseHoldCancelCount` / `purchaseHoldWindowDays`.
- **`src/modules/orders/services/timeline.ts`** — uses `orderEventTextRetentionDays`.
- **`src/modules/orders/services/status.ts`** — uses `withdrawalPeriodDays` for withdrawal-window logic.
- **`src/modules/orders/emails.ts`** — calls `orderFrontendLink` to embed a clickable order URL in notification emails.
- **`src/modules/delivery/services/notify.ts`** — may use `orderFrontendLink` in delivery notifications.
- **`src/modules/orders/module.ts`** — registers the orders module; this config file is its tunable surface.
- **`scenarios/flows/shop-history.ts`** — test scenario that can override any getter per case (the "read per call" pattern exists for this).

## Notes

- Every value is read **per call**, not captured at import. This is the explicit contract so a test (or a scenario) can stub any single knob without affecting others. Do not memoise or cache the getters.
- The two `max*` functions intentionally `Math.min` against the Zod API contract. A config value above the contract ceiling is silently ineffective — the schema rejects first.
- `orderPagePath` returns a **bare path** (e.g. `orders/65f0`), not a URL. Callers that already operate on paths (e.g. the staff outbox notice) use it directly; `orderFrontendLink` is the one that builds a full URL.
- The function-replacer in `replaceAll` is deliberate: it prevents `$&` (or similar) sequences in an order id from being treated as JS replacement patterns.
- `NODE_WITHDRAWAL_PERIOD_DAYS` has `min: 21` (not the legal floor of 14) so that a Friday-to-Monday gap can never shrink the effective window.
