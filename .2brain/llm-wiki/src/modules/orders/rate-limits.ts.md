---
source: src/modules/orders/rate-limits.ts
sha256: f9105db26f042d660da70a4704a16f7397cfc0f6db5191d675a7bf12eff5443b
generated_at: 2026-10-29T04:44:23.936073+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/rate-limits.ts

## Purpose

Declares the orders module's rate-limit budget for the `GET /orders/export` endpoint and turns it into a ready-to-attach Express middleware. The budget is scoped per authenticated account because the export performs a long cursor scan rather than a quick lookup.

## Key elements

- **`ORDERS_EXPORT_BUDGET`** (module-private) — The `RateLimitBudget` object. Merges the numeric thresholds from the generated data with the account-keyed strategy (`KEYED_BY_AUTHENTICATED_ACCOUNT` + `accountIdOf`).
- **`ordersExportLimiter`** (exported `RequestHandler`) — The concrete Express middleware produced by `buildRateLimiter`. Applied directly to the export route.
- **`ordersRateLimits`** (exported `readonly RateLimitBudget[]`) — The module's full budget list; consumed by `module.ts`'s `rateLimits` declaration for discovery/documentation.

## Relationships

- **`@infrastructure/http/middlewares/rate-limit`** — Supplies the `buildRateLimiter` factory, the `accountIdOf` key generator, and the `KEYED_BY_AUTHENTICATED_ACCOUNT` constant. This file is a thin caller of that shared infrastructure.
- **`./rate-limits.generated.ts`** — Source of the numeric thresholds (`ordersRateLimitData.ordersExport`); this file does not hard-code limits.
- **`./module.ts`** — Imports `ordersRateLimits` and exposes it on the module's `rateLimits` property.
- **`./routes.ts`** — Attaches `ordersExportLimiter` to the export route handler.
- **`@types`** (`rate-limit-budget.ts` / `index.ts`) — Provides the `RateLimitBudget` type used to shape the budget object.

## Notes

- The limiter is **per account, not per IP**. Unauthenticated or differently-identified callers will collide on the same key if `accountIdOf` cannot resolve an account.
- Numeric limits (window size, max calls) live in `rate-limits.generated.ts`; editing this file only changes the keying strategy, not the thresholds.
- The doc comment frames the budget as "a long read, not a burst" — the intent is to tolerate a human reconciling a month across a few filters while blocking script-driven enumeration.
