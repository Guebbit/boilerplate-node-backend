---
source: src/modules/stats/services/index.ts
sha256: 5eb4bba7c34ed5362f81dc9211eca0c426c7f6667430a4f6bb570304f7b73f4e
generated_at: 2026-10-15T12:04:15.996719+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stats/services/index.ts

## Purpose

Barrel/facade module for the stats service. It re-exports every read-only stats function from the individual service files (`sales`, `breakdowns`, `range`) and bundles them into a single `statsService` object, giving controllers and the module entry point one import location. It performs no logic of its own and stores nothing.

## Key elements

- **`statsService`** (object) — The public surface. Groups `getSalesStats`, `getProductStats`, `getProductSeries`, `getCategoryStats`, `getPaymentMix`, `getOperationsStats`, `getCustomerStats`, and `getPipelineStats` behind one object so callers can do `statsService.getSalesStats(...)`.
- **Re-exports from `./sales`** — `getSalesStats`.
- **Re-exports from `./breakdowns`** — `getCategoryStats`, `getCustomerStats`, `getOperationsStats`, `getPaymentMix`, `getPipelineStats`, `getProductSeries`, `getProductStats`.
- **Re-exports from `./range`** — `resolvePeriod` (function) and `Period` (type). These are the *only* non-stat exports in this file.
- **Individual named exports** — Every function above is also exported directly (not only via `statsService`), so consumers may import by name or through the object.

## Relationships

- **`services/sales.ts`** and **`services/breakdowns.ts`** — Provide the stat functions this file re-exports and places into `statsService`.
- **`services/range.ts`** — Provides `resolvePeriod` / `Period`; this file is the sole re-export point for those.
- **`controllers/get-stats.ts`** — Consumes this module (via `statsService` or the named exports) to serve dashboard stat requests.
- **`src/modules/stats/index.ts`** — Module-level entry that re-exports this file, making the stats service available at the module root.
- **`tests/integration/stats.test.ts`** — Integration tests exercise the exported functions through this facade.

## Notes

- Two import styles coexist: individual named imports *and* the `statsService` object. Both resolve to the same underlying functions; prefer whichever the consuming controller already uses.
- `resolvePeriod` and `Period` are the only exports not grouped into `statsService` (they are utility/type, not stat queries).
- This file is intentionally side-effect-free; all data is read on demand from the owning modules.
