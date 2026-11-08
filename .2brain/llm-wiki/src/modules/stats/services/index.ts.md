---
source: src/modules/stats/services/index.ts
sha256: c60b2cefc0b4356fb850f81bd9b15618dddf704b35e0fb419d84c6cb977c07d6
generated_at: 2026-11-08T08:25:39.659797+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stats/services/index.ts

## Purpose

Service-layer facade for the stats module. It re-exports the period-resolution utility from `range.ts`, bundles all read-only stat queries from `sales.ts` and `breakdowns.ts` into a single `statsService` object, and exposes that object as the one API surface every controller calls. It performs no logic of its own — every figure is read on demand from whichever module owns it.

## Key elements

- **`statsService`** — the sole named export (besides `resolvePeriod`/`Period`). An object that groups `getSalesStats`, `getProductStats`, `getProductSeries`, `getCategoryStats`, `getPaymentMix`, `getOperationsStats`, `getCustomerStats`, and `getPipelineStats` under one namespace.
- **`resolvePeriod`, `Period`** (re-exported from `./range`) — the only individual-symbol re-export; lets callers resolve a period into the shop's timezone without importing `range` directly.

## Relationships

- **`./range.ts`, `./sales.ts`, `./breakdowns.ts`** — direct imports; this file is a pure re-export/facade over them.
- **`src/modules/stats/controllers/get-stats.ts`** — primary consumer; calls through `statsService` rather than importing the sub-services directly.
- **`src/modules/stats/index.ts`** — module-level barrel; wires this service layer into the public stats module.
- **`src/modules/stats/tests/integration/stats.test.ts`** — exercises the `statsService` surface end-to-end.

## Notes

- All eight query functions live in their respective files (`sales.ts` or `breakdowns.ts`); this file adds no behavior. If you need to change a query, edit the owning file, not this index.
- The module docblock explicitly states it is read-only and stores nothing — treat it as a read-only projection.
- `resolvePeriod` is the *only* symbol re-exported individually (not via `statsService`). Code that needs period resolution without touching the other queries can `import { resolvePeriod } from '…/services'` directly.
