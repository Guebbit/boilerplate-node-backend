---
source: src/modules/notifications/index.ts
sha256: 366052031bea422154be4d193b6f7a5b1ebcacff226bb69e988607ff351a6cdd
generated_at: 2026-10-15T10:50:18.012825+00:00
model: ollama:qwen3.8:27b
---

# src/modules/notifications/index.ts

## Purpose

Public barrel (single import surface) for the `notifications` module. Per the strategic-DDD rule (see `docs/theory/strategic-ddd.md` §5), sibling modules may only import from this file. It is designed primarily for *reading* notification data—siblings that need to *act* on a user should emit a domain event rather than call in.

## Key elements

- `export * from './services'` — re-exports all values (functions, classes) from the services layer.
- `export type * from './model'` — re-exports type definitions (entities, value objects) from the domain model.
- `export type * from './presenter'` — re-exports type definitions (view models / presentation types) from the presenter.

No logic lives here; it is purely a re-export shim.

## Relationships

- **`src/modules/notifications/model.ts`** — types only, re-exported so external consumers can reference domain types without reaching into the module internals.
- **`src/modules/notifications/presenter.ts`** — types only, re-exported for view-model / display types.
- **`src/modules/notifications/services/index.ts`** — full value re-export; this is the only runtime surface exposed to siblings.

## Notes

- The module is intentionally **read-only for outsiders**: the design discourages siblings from triggering notifications directly. Use a domain event instead (per the doc-comment and the strategic-DDD doc).
- `export type *` is used for `model` and `presenter`, meaning no runtime values from those files leak through the barrel—only compile-time type information.
