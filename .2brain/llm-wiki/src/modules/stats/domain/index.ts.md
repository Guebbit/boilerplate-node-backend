---
source: src/modules/stats/domain/index.ts
sha256: 3d537df5229495d7a4a0ffaee02e316d143b528008d5ba51518555652fa62b77
generated_at: 2026-10-15T12:03:09.550609+00:00
model: ollama:qwen3.8:27b
---

# src/modules/stats/domain/index.ts

## Purpose

Barrel file for the stats domain layer. It re-exports the public API of the two domain submodules (`range` and `calendar`) under a single import path, so consumers can `import { … } from '../domain'` without reaching into individual files.

## Key elements

- `export * from './range'` — re-exports every named export from the reporting-range domain module.
- `export * from './calendar'` — re-exports every named export from the shop-calendar domain module.
- Module doc comment (`@module`) — labels this as the domain-layer entry point and points to `docs/theory/domain-layer.md` for the architectural rationale.

## Relationships

- **src/modules/stats/domain/range.ts** — Directly re-exported; all of its named exports become part of this module's public surface.
- **src/modules/stats/domain/calendar.ts** — Directly re-exported; all of its named exports become part of this module's public surface.
- **src/modules/stats/index.ts** — Upstream consumer; imports the stats domain (via this barrel) to expose the domain API at the module root.

## Notes

- This file contains **no logic** — it is purely a re-export. Changing what `range.ts` or `calendar.ts` export automatically changes this module's surface without editing this file.
- The `@module` doc comment is the single source of truth for *what this layer is meant to be*; the companion doc at `docs/theory/domain-layer.md` holds the full explanation.
