---
source: src/modules/stats/index.ts
sha256: 58824bd0274ecc92eca6fb69144d9dd7ed73d640615f0eecb5adfc3977fa66b1
generated_at: 2026-11-08T08:24:34.099783+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stats/index.ts

## Purpose

Public barrel (re-export) file for the stats module. It is the single entry point that sibling modules are allowed to import from, per the strategic DDD rule in `docs/theory/strategic-ddd.md` §5. No other module currently depends on it; it exists because the convention requires every module to publish a barrel.

## Key elements

- `export * from './services'` — re-exports the public API of `src/modules/stats/services/index.ts`.
- `export * from './domain'` — re-exports the public API of `src/modules/stats/domain/index.ts`.

No functions, classes, or logic are defined here; the file is purely re-exports.

## Relationships

- **src/modules/stats/services/index.ts** — Re-exported via `export *`. This is the upstream source of the services API surface.
- **src/modules/stats/domain/index.ts** — Re-exported via `export *`. This is the upstream source of the domain model surface.

Both neighbors are re-exported in the order services → domain. No other files import from this barrel today.

## Notes

- Importing from internal paths (e.g. `../stats/services` directly) bypasses the barrel and violates the stated rule. Consumers should always go through this file.
- Because it uses `export *`, name collisions between `services` and `domain` would surface here rather than at the call site.
- The file carries no runtime code; bundlers may tree-shake it away if nothing imports it.
