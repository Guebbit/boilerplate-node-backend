---
source: src/modules/sitemap/index.ts
sha256: c46880fac344ff25f57b6409c66e091192cb20a90b92323d636d8329796f6e57
generated_at: 2026-10-29T05:53:41.442381+00:00
model: ollama:qwen3.8:27b
---

# src/modules/sitemap/index.ts

## Purpose

Public barrel (re-export) for the `sitemap` module. It exists so that sibling modules have a single, stable import target and never reach into the module's internal file layout. Per the strategic-DDD rule (see `docs/theory/strategic-ddd.md` §5), this file is the **only** surface a sibling module is allowed to import from.

## Key elements

- **`export * from './service'`** — Re-exports every public symbol from the module's implementation file (`service.ts`). No logic lives here; it is a pure re-export.

## Relationships

- **`src/modules/sitemap/service.ts`** — The sole dependency. This barrel re-exports its entire public API, making `service.ts`'s exports the de-facto public interface of the `sitemap` module.

## Notes

- Do **not** add logic, side-effects, or selective named exports here; it must stay a transparent pass-through.
- Sibling modules must import from `src/modules/sitemap` (this file), never directly from `src/modules/sitemap/service`. Enforced by convention / the DDD rule cited in the header.
- For module-level context see `docs/modules/sitemap.md`.
