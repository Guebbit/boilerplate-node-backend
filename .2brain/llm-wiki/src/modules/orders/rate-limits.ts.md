---
source: src/modules/orders/rate-limits.ts
sha256: 9430f0bfcac73a95c50fd52801cd2c0eb064d9aeb65db7d40238f9b2cca3d376
generated_at: 2026-11-08T06:54:30.797773+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/rate-limits.ts

## Purpose

Declares the two rate-limit budgets specific to the orders module (export and timeline-note endpoints) and exposes them as ready-to-use Express `RequestHandler` middlewares. It converts the raw budget data into middleware via the shared `buildRateLimiter` factory so the orders routes can enforce per-account request windows without re-implementing limiter logic.

## Key elements

- **`ORDERS_EXPORT_BUDGET`** (internal) — `RateLimitBudget` object for `GET /orders/export`; pulls numeric limits from `ordersRateLimitData.ordersExport` and keys by authenticated account.
- **`ordersExportLimiter`** (exported) — `RequestHandler` middleware produced by `buildRateLimiter(ORDERS_EXPORT_BUDGET)`.
- **`ORDERS_NOTE_BUDGET`** (internal) — `RateLimitBudget` object for `POST /orders/:id/timeline/notes`; keyed by authenticated account.
- **`ordersNoteLimiter`** (exported) — `RequestHandler` middleware produced by `buildRateLimiter(ORDERS_NOTE_BUDGET)`.
- **`ordersRateLimits`** (exported) — `readonly RateLimitBudget[]` array containing both budgets; referenced by `module.ts`'s `rateLimits` declaration.

## Relationships

- **`src/infrastructure/http/middlewares/rate-limit.ts`** — provides `buildRateLimiter` (the factory that turns a budget into a `RequestHandler`), `accountIdOf` (key generator), and `KEYED_BY_AUTHENTICATED_ACCOUNT` (keying strategy constant). This file is a *consumer* of that infrastructure module.
- **`src/types/rate-limit-budget.ts`** (re-exported via `src/types/index.ts` as `@types`) — defines the `RateLimitBudget` type that both budget objects conform to.
- **`src/modules/orders/module.ts`** — its `rateLimits` export references the `ordersRateLimits` array declared here, making this file the source of truth for the orders module's budget list.
- **`src/modules/orders/routes.ts`** — applies `ordersExportLimiter` and `ordersNoteLimiter` as middleware on the corresponding route handlers.
- **`src/modules/orders/tests/integration/note-rate-limit.test.ts`** — integration test that exercises `ordersNoteLimiter` against the live route.

## Notes

- Numeric limits (window, max requests) live in `./rate-limits.generated`, a generated file not checked in by hand. Editing the limits means regenerating that file, not editing this one.
- Both budgets use the same keying strategy (`KEYED_BY_AUTHENTICATED_ACCOUNT` + `accountIdOf`); there is no per-IP fallback in this module.
- The internal budget consts (`ORDERS_EXPORT_BUDGET`, `ORDERS_NOTE_BUDGET`) are **not** exported — only the built `RequestHandler`s and the combined `ordersRateLimits` array are public. Consumers should import the limiters, not the raw budget objects.
