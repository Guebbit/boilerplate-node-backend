---
source: src/modules/stats/services/index.ts
sha256: c60b2cefc0b4356fb850f81bd9b15618dddf704b35e0fb419d84c6cb977c07d6
generated_at: 2026-10-29T05:56:11.293594+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stats/services/index.ts

## Purpose

Barrel module that assembles the stats service's public API. It aggregates the read-only query functions from `sales.ts` and `breakdowns.ts` into a single `statsService` object and re-exports the period-resolution utilities from `range.ts`, giving controllers one import point for all dashboard data reads.

## Key elements

- **`statsService`** (const, exported) — Plain object bundling eight read functions: `getSalesStats`, `getProductStats`, `getProductSeries`, `getCategoryStats`, `getPaymentMix`, `getOperationsStats`, `getCustomerStats`, `getPipelineStats`. Controllers call through this rather than importing individual service files.
- **`resolvePeriod`** (re-exported from `./range`) — Resolves a requested period into the shop's timezone.
- **`Period`** (type, re-exported from `./range`) — The period type used by `resolvePeriod`.

## Relationships

- **`./sales.ts`** — Source of `getSalesStats`, pulled into `statsService`.
- **`./breakdowns.ts`** — Source of the seven breakdown/series functions, all pulled into `statsService`.
- **`./range.ts`** — Source of `resolvePeriod` and the `Period` type, re-exported directly (not wrapped in `statsService`).
- **`../controllers/get-stats.ts`** — Primary consumer; imports `statsService` (and likely `resolvePeriod`) to handle incoming dashboard requests.
- **`../index.ts`** — Module entry point; re-exports or references this file's public surface.
- **`../../tests/integration/stats.test.ts`** — Exercises the stats service through this interface.

## Notes

- `resolvePeriod` is intentionally **outside** `statsService` — it's a utility, not a data query. Consumers import it directly rather than via the object.
- No state is stored here or in any sub-service; every call is a fresh read. Treat this module as purely a read facade.
