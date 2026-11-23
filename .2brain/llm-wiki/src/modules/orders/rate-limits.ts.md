---
source: src/modules/orders/rate-limits.ts
source_sha256: d964440fd7d35ee9b524c3de9a68af5539626c3d271392ee0eb1227263057f1e
context_sha256: 7ff07b1588d4f5063b247c914c4ceb3359c97f25553eb3055dcd2e7a55040721
generated_at: 2026-11-22T06:17:22.141144+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/rate-limits.ts

## Purpose
Defines the orders module's own rate-limit budgets and the middleware built from them: one for the order export route (`GET /orders/export`) and one for adding timeline notes (`POST /orders/:id/timeline/notes`). Budgets are plain data (`RateLimitBudget`) turned into Express middleware by the shared `buildRateLimiter` factory, the same one other modules use.

## Key elements
- `ordersExportLimiter` — `RequestHandler` built from the export budget. Intended to throttle long cursor scans (up to `NODE_ORDER_EXPORT_MAX_ROWS` orders per export).
- `ordersNoteLimiter` — `RequestHandler` built from the note budget. Intended to stop scripts from filling the timeline with staff notes.
- `ordersRateLimits` — `readonly RateLimitBudget[]` of both budgets (export, then note), for declaration on `./module.ts`'s `rateLimits`.
- `ORDERS_EXPORT_BUDGET` / `ORDERS_NOTE_BUDGET` (not exported) — spread the numeric data from `ordersRateLimitData.ordersExport` / `.ordersNote` (imported from `./rate-limits.generated`) and add `keyedBy: KEYED_BY_AUTHENTICATED_ACCOUNT` and `keyGenerator: accountIdOf`.

## Relationships
- `src/infrastructure/http/middlewares/rate-limit.ts` — provides `buildRateLimiter`, `accountIdOf` and `KEYED_BY_AUTHENTICATED_ACCOUNT`, all used here.
- `src/types/rate-limit-budget.ts` (re-exported via `src/types/index.ts` as `@types`) — defines the `RateLimitBudget` type.
- `src/modules/orders/module.ts` — lists `ordersRateLimits` as the module's `rateLimits`.
- `src/modules/orders/routes.ts` — the export and note routes use the limiters (inferred from the route names in the doc comments).
- `src/modules/orders/tests/integration/note-rate-limit.test.ts` — integration test for the note limit.

## Notes
- Both budgets are keyed per authenticated account, not per IP.
- The numeric limits are not in this file; they come from the generated data module `./rate-limits.generated`.
