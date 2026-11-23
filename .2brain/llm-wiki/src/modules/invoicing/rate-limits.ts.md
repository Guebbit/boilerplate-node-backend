---
source: src/modules/invoicing/rate-limits.ts
source_sha256: 4b4aa8126183ce17e1f34af949d83eb63041c1c5fa2666fbecfc4624f86e4302
context_sha256: f8a4e02c262fb39ac82cae53e4b50c5e16ec1975e3ae5e22b97c881ef2e83f83
generated_at: 2026-11-22T05:33:44.234619+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/invoicing/rate-limits.ts

## Purpose
Defines the invoicing module's own rate-limit budget and the Express middleware built from it. A single budget covers both `GET /orders/:id/invoice` and `GET /orders/:id/credit-notes/:creditNoteId`, because both trigger the same Chromium launch (`renderHtmlToPdf`), which costs CPU and memory that an ordinary request handler does not.

## Key elements
- `INVOICING_RENDER_BUDGET` (private) is a `RateLimitBudget`. It spreads the `invoicingRender` entry of `invoicingRateLimitData` (imported from `./rate-limits.generated`) and adds `keyedBy: KEYED_BY_AUTHENTICATED_ACCOUNT` and `keyGenerator: accountIdOf`. Limits are therefore counted per account.
- `invoicingLimiter` (exported) is a `RequestHandler` produced by `buildRateLimiter(INVOICING_RENDER_BUDGET)`. It is applied to both download routes.
- `invoicingRateLimits` (exported) is a `readonly RateLimitBudget[]` containing the budget. It is the list declared on `./module.ts`'s `rateLimits`.

## Relationships
- `src/infrastructure/http/middlewares/rate-limit.ts` provides `buildRateLimiter`, `accountIdOf` and `KEYED_BY_AUTHENTICATED_ACCOUNT`. It is the same factory every other module's budgets go through.
- `src/modules/invoicing/module.ts` imports `invoicingRateLimits` and declares it as the module's `rateLimits`.
- `src/modules/invoicing/routes.ts` applies `invoicingLimiter` to the two download routes.
- `src/types/index.ts` re-exports the `RateLimitBudget` type, which this file imports as `@types`. It is defined in `src/types/rate-limit-budget.ts`.

## Notes
- The window and max values are not set in this file. They come from the generated data it imports, so change them at that source rather than here.
- Per the doc comment, the budget is sized well above one legitimate session's download-view-redownload burst and well below the global brake.
