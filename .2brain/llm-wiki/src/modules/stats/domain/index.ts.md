---
source: src/modules/stats/domain/index.ts
source_sha256: d1e8717dba409c94df93801ffbf647d2c3a74ab8aa75dd66cf669b4fb9f65cbf
context_sha256: b902d4825bea6236f0fd47c0141f1ab6aab32ae5750cc91c9c554cc91d186d29
generated_at: 2026-11-22T07:50:55.891391+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/stats/domain/index.ts

## Purpose
Barrel file for the stats domain layer. Its module doc describes that layer as the pure rules of a reporting range, the shop's calendar and the sales figures. It re-exports the three domain files so consumers can import from one entry point.

## Key elements
- `export * from './range'`: re-exports the reporting-range rules.
- `export * from './calendar'`: re-exports the shop calendar rules.
- `export * from './figures'`: re-exports the sales-figures rules.

The file defines no logic of its own.

## Relationships
- `./range`, `./calendar` and `./figures` (`src/modules/stats/domain/range.ts`, `calendar.ts`, `figures.ts`): everything they export is surfaced through this file.
- `src/modules/stats/index.ts` and `src/modules/stats/controllers/respond.ts` sit next to it in the dependency graph. The visible content doesn't show how either one uses this file, so check them directly if you need that.

## Notes
- Because every export is a wildcard re-export, a new export in any of the three files becomes public here automatically. Name collisions between those files would also surface here.
