---
source: src/modules/stats/domain/index.ts
sha256: 0635dfd8905b9d5b08b0c1602466d6cf8d96fc11c736cc64fb3d8bace8f9d16a
generated_at: 2026-11-14T22:01:17.988327+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stats/domain/index.ts

## Purpose

Barrel file that exposes the public API of the stats **domain layer** — the pure rules governing a reporting range, the shop's calendar, and sales figures. Importers should reach for this path (or for `src/modules/stats/index.ts`) rather than importing individual sub-modules directly.

## Key elements

- **`export * from './range'`** — re-exports the reporting-range types and helpers.
- **`export * from './calendar'`** — re-exports the shop-calendar domain logic.
- **`export * from './figures'`** — re-exports sales-figure domain logic.
- **Module doc comment** — points to `docs/theory/domain-layer.md` for the architectural rationale behind the domain layer.

## Relationships

- **`src/modules/stats/domain/range.ts`**, **`calendar.ts`**, **`figures.ts`** — the three files whose public symbols are re-exported by this index; this file is their sole aggregation point.
- **`src/modules/stats/index.ts`** — higher-level module entry that (re)exports the domain barrel, making the stats domain reachable from the module root.
- **`src/modules/stats/controllers/respond.ts`** — controller-layer consumer that imports domain types/logic through this barrel (or the module root).

## Notes

- This file contains **no logic** — only `export *` statements and a doc comment. All actual domain rules live in the three sub-modules.
- The doc comment explicitly references `docs/theory/domain-layer.md`; if the domain-layer conventions change, that doc is the source of truth, not the code here.
