---
source: src/modules/sitemap/index.ts
sha256: c46880fac344ff25f57b6409c66e091192cb20a90b92323d636d8329796f6e57
generated_at: 2026-11-08T08:22:22.847007+00:00
model: ollama:qwen3.8:27b
---

# src/modules/sitemap/index.ts

## Purpose

Public barrel file for the `sitemap` module. It is the sole import surface exposed to sibling modules, enforcing the encapsulation rule described in `docs/theory/strategic-ddd.md` §5 so that external code never reaches into internal implementation files directly.

## Key elements

- `export * from './service'` — re-exports the entire public API defined in `./service.ts`. No additional logic, constants, or types are declared here.

## Relationships

- **`src/modules/sitemap/service.ts`** — the sole dependency; every symbol this barrel exposes originates from that file.

## Notes

- Do not add local declarations or conditional exports here; the file is intentionally a flat re-export so the import contract stays in one place.
- Sibling modules must import via this barrel (e.g. `import { … } from '…/sitemap'`), never from `…/sitemap/service` directly.
