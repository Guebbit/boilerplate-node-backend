---
source: src/modules/stats/services/index.ts
source_sha256: c60b2cefc0b4356fb850f81bd9b15618dddf704b35e0fb419d84c6cb977c07d6
context_sha256: cc5ef6717b1a16e4aed30864462a5c6fd93b8ce4c4ea9936193ee67f1733b6b5
generated_at: 2026-11-22T07:51:58.104019+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/stats/services/index.ts

## Purpose
Barrel and public entry point for the stats service, which feeds the dashboard. It stores nothing: every figure is read on demand from the module that owns the data. It gathers the read functions from the sibling files into a single `statsService` object and re-exports the period helpers.

## Key elements
- `statsService`: the service's public surface, and the object every controller goes through. It bundles these functions:
  - `getSalesStats` (from `./sales`)
  - `getProductStats`
  - `getProductSeries`
  - `getCategoryStats`
  - `getPaymentMix`
  - `getOperationsStats`
  - `getCustomerStats`
  - `getPipelineStats`

  The last seven come from `./breakdowns`.
- `resolvePeriod` and the `Period` type: re-exported from `./range`. Per the module doc, `range.ts` checks a period and puts it in the shop's zone.

## Relationships
- `./sales` supplies `getSalesStats`.
- `./breakdowns` supplies the other seven stat readers.
- `./range` supplies `resolvePeriod` and `Period`, which are re-exported unchanged.
- `src/modules/stats/controllers/get-stats.ts` is the controller layer. The file comment states that controllers use `statsService`.
- `src/modules/stats/index.ts` and `src/modules/stats/tests/integration/stats.test.ts` are linked neighbors. This file's content does not show how they use it.

## Notes
- This file contains no logic of its own. It only imports, re-exports and groups.
- Controllers should call the functions through `statsService`, not by importing the sibling files directly.
