---
source: src/modules/invoicing/rate-limits.ts
sha256: d15b65654cbe4027a9c9b40483599554896829507f21f49a1c97ff8b188725ba
generated_at: 2026-11-08T06:13:19.953852+00:00
model: ollama:qwen3.8:27b
---

# src/modules/invoicing/rate-limits.ts

## Purpose

Defines the invoicing module's rate-limit budget (`INVOICING_RENDER_BUDGET`) and the resulting Express middleware (`invoicingLimiter`) that protects the two invoice-rendering GET routes. Both routes share a single budget because each hit spawns a full Chromium launch (`renderHtmlToPdf`), which is far more expensive than a typical request.

## Key elements

- **`INVOICING_RENDER_BUDGET`** (const, module-private) — A `RateLimitBudget` object. Numeric limits are spread in from `invoicingRateLimitData.invoicingRender` (imported from `./rate-limits.generated`). Keyed per authenticated account via `accountIdOf`.
- **`invoicingLimiter`** (export) — An Express `RequestHandler` produced by `buildRateLimiter(INVOICING_RENDER_BUDGET)`. Applied to `GET /orders/:id/invoice` and `GET /orders/:id/credit-notes/:creditNoteId`.
- **`invoicingRateLimits`** (export) — `readonly RateLimitBudget[]` containing just `INVOICING_RENDER_BUDGET`. Referenced by `./module.ts`'s top-level `rateLimits` declaration so the module can enumerate its budgets.

## Relationships

- **`src/infrastructure/http/middlewares/rate-limit.ts`** — Provides `buildRateLimiter` (the shared factory that turns a budget into middleware), `accountIdOf` (key generator), and `KEYED_BY_AUTHENTICATED_ACCOUNT` (keying strategy). This file is a consumer of that factory.
- **`src/modules/invoicing/module.ts`** — Lists `invoicingRateLimits` in its `rateLimits` array, making the budget visible to the module's registration/metadata.
- **`src/modules/invoicing/routes.ts`** — Applies the exported `invoicingLimiter` as route middleware on the two invoice/credit-note GET endpoints.
- **`src/types/index.ts`** — Source of the `RateLimitBudget` type (imported as `@types`).
- **`src/types/rate-limit-budget.ts`** — Underlying definition of `RateLimitBudget` (re-exported through `src/types/index.ts`).

## Notes

- The numeric limits live in `./rate-limits.generated`, not in this file. Edit the generated file (or its generator) to change thresholds.
- Sizing intent (from the inline comment): comfortably above a single user's download → view → re-download burst, but well below the global rate-limit brake.
- Only one budget exists for invoicing; both download routes share it rather than having independent limits.
