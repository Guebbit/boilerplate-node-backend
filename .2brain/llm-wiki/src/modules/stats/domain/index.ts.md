---
source: src/modules/stats/domain/index.ts
sha256: 3d537df5229495d7a4a0ffaee02e316d143b528008d5ba51518555652fa62b77
generated_at: 2026-11-08T08:24:17.417564+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stats/domain/index.ts

## Purpose

Barrel file for the stats domain layer. It re-exports the public API of `range` and `calendar` so that consumers (controllers, the module's top-level `index`) can import domain types and functions from a single path rather than reaching into individual files.

## Key elements

- **`export * from './range'`** — re-exports all named exports of the reporting-range module (e.g., range types, boundary logic).
- **`export * from './calendar'`** — re-exports all named exports of the shop-calendar module (e.g., open/close rules, day-level logic).

## Relationships

- **`src/modules/stats/domain/range.ts`** — directly re-exported; this file is the sole public surface for its exports.
- **`src/modules/stats/domain/calendar.ts`** — directly re-exported; same role as above.
- **`src/modules/stats/index.ts`** — module-level barrel that re-exports this file (or its sub-modules), making the domain layer visible to the broader app.
- **`src/modules/stats/controllers/respond.ts`** — controller layer; imports domain symbols (range/calendar) through this file rather than importing the leaf files directly.

## Notes

- This file contains **no logic of its own**—it is purely a re-export. Any name collision between `range.ts` and `calendar.ts` would surface here at compile time.
- New domain sub-modules must be added to this barrel to become part of the public stats-domain API; importing them by relative path bypasses the intended entry point.
