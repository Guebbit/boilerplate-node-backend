---
source: src/modules/orders/rate-limits.ts
sha256: 6356a682d05189c11a35bbe4c66034c28099411362ac18899da2d75add9e3b43
generated_at: 2026-10-15T11:05:58.883266+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/rate-limits.ts

## Purpose

Defines the orders module's rate-limit budget(s) and exports a ready-to-use Express middleware for the `GET /orders/export` endpoint. It is the single place where the module's export budget is declared, then handed to the shared `buildRateLimiter` factory to produce the actual limiter.

## Key elements

- **`ORDERS_EXPORT_BUDGET`** (module-private) — The `RateLimitBudget` object for CSV exports. Keyed by authenticated account ID (`KEYED_BY_AUTHENTICATED_ACCOUNT` / `accountIdOf`), 10 requests per shared window, overridable via `NODE_ORDER_EXPORT_RATE_LIMIT_MAX`, marked `audited: true`.
- **`ordersExportLimiter`** (exported) — The pre-built Express `RequestHandler` produced by `buildRateLimiter(ORDERS_EXPORT_BUDGET)`. Drop it directly onto the export route.
- **`ordersRateLimits`** (exported) — `readonly RateLimitBudget[]` listing every budget this module declares. Consumed by `module.ts`'s `rateLimits` field for centralized registration/inspection.

## Relationships

- **`src/infrastructure/http/middlewares/rate-limit.ts`** — Supplies `buildRateLimiter`, `accountIdOf`, and `KEYED_BY_AUTHENTICATED_ACCOUNT`. This file is a pure consumer of that factory; all budget-to-middleware conversion happens there.
- **`src/modules/orders/module.ts`** — Reads `ordersRateLimits` into its `rateLimits` declaration so the module manifest knows which budgets exist.
- **`src/modules/orders/routes.ts`** — Applies `ordersExportLimiter` as middleware on the `GET /orders/export` route.
- **`src/types/rate-limit-budget.ts`** / **`src/types/index.ts`** — Provide the `RateLimitBudget` type used by both the local constant and the exported array.

## Notes

- `windowMs: 'shared'` means this budget does not define its own window; it inherits whatever shared window the infrastructure layer configures globally.
- Keying is deliberately per-account, not per-address. The doc comment explains the trade-off: step-up auth already guarantees a human, and an address-keyed budget would let one manager behind a shared address starve every other caller on that address.
- The budget guards a long cursor-based read (up to `NODE_ORDER_EXPORT_MAX_ROWS` rows), not a burst. The 10-per-window default is tuned accordingly—comfortable for manual reconciliation, hostile to scripted enumeration.
- `audited: true` implies the limiter logs/records hits for the audit trail referenced in `docs/tools/security.md#the-rate-limit-budgets`.
