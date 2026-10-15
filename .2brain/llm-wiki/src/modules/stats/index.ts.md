---
source: src/modules/stats/index.ts
sha256: 58824bd0274ecc92eca6fb69144d9dd7ed73d640615f0eecb5adfc3977fa66b1
generated_at: 2026-10-15T12:03:26.452290+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stats/index.ts

## Purpose

Public barrel file for the `stats` module. It is the sole import surface that sibling modules are allowed to use (per the rule in `docs/theory/strategic-ddd.md` §5). It re-exports everything from the module's `domain` and `services` sub-barrels so consumers can do a single `import … from '@modules/stats'` instead of reaching into internal paths.

## Key elements

- **`export * from './services'`** — re-exports the full public API of `src/modules/stats/services/index.ts`.
- **`export * from './domain'`** — re-exports the full public API of `src/modules/stats/domain/index.ts`.

No functions, classes, or logic live in this file; it is purely a re-export shim.

## Relationships

- **`src/modules/stats/domain/index.ts`** — imported and re-exported; this file is its designated public entry point.
- **`src/modules/stats/services/index.ts`** — imported and re-exported; this file is its designated public entry point.

No other module currently imports this barrel.

## Notes

- The barrel exists by convention ("every module publishes one") even though it has zero downstream dependents today.
- Sibling modules must import from this file, not directly from `./domain` or `./services`. Enforced by the strategic-DDD rule referenced in the doc comment, not by a build-time guard.
- For module-level documentation see `docs/modules/stats.md`.
