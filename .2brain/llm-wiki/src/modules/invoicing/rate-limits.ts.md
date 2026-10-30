---
source: src/modules/invoicing/rate-limits.ts
sha256: d15b65654cbe4027a9c9b40483599554896829507f21f49a1c97ff8b188725ba
generated_at: 2026-10-29T04:13:05.584175+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/rate-limits.ts

## Purpose

Defines the shared rate-limit budget for the two invoice-rendering routes (`GET /orders/:id/invoice` and `GET /orders/:id/credit-notes/:creditNoteId`). Both endpoints spawn a Chromium launch via `renderHtmlToPdf`, so they share a single per-account budget to cap the CPU/memory cost that a normal request handler would not incur.

## Key elements

- **`INVOICING_RENDER_BUDGET`** (internal) — A `RateLimitBudget` that merges the numeric limits from the generated file with account-based keying (`KEYED_BY_AUTHENTICATED_ACCOUNT` + `accountIdOf`).
- **`invoicingLimiter`** (exported) — The ready-to-use Express `RequestHandler` produced by `buildRateLimiter`; applied to both rendering routes.
- **`invoicingRateLimits`** (exported) — A `readonly RateLimitBudget[]` (currently just `[INVOICING_RENDER_BUDGET]`) that is listed on `./module.ts`'s `rateLimits` declaration.

## Relationships

- **`@infrastructure/http/middlewares/rate-limit`** — Imports the `buildRateLimiter` factory, the `accountIdOf` key generator, and the `KEYED_BY_AUTHENTICATED_ACCOUNT` constant. This is the same factory every module's budgets go through.
- **`./rate-limits.generated.ts`** — Source of the numeric limit values (`invoicingRateLimitData.invoicingRender`) that are spread into the budget object.
- **`@types`** — Provides the `RateLimitBudget` type (declared in `src/types/rate-limit-budget.ts`, re-exported via `src/types/index.ts`).
- **`./module.ts`** — References `invoicingRateLimits` in its `rateLimits` array, making this file's budgets discoverable at the module level.
- **`./routes.ts`** — Consumes `invoicingLimiter` as middleware on the two rendering GET routes.

## Notes

- One budget covers **both** endpoints deliberately; do not split them without also splitting the Chromium cost model.
- The numeric thresholds live in the generated file — adjust limits there, not here.
- Sizing intent (from the inline comment): comfortably above a single session's download → view → re-download burst, well below any global brake.
