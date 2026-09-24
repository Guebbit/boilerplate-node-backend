---
source: src/modules/wishlist/index.ts
sha256: 55f936a338a27b26623e615145c2a34659deefcf9ce245ad1cdea2113801ec4e
generated_at: 2026-09-23T19:47:07.991635+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/index.ts

## Purpose

Barrel (public entry point) for the `wishlist` module. It re-exports the module's API so that sibling modules import from this single file rather than reaching into internal paths. Enforces the "single surface" rule described in `docs/theory/strategic-ddd.md` §5.

## Key elements

- **`export * from './service'`** — re-exports all runtime values (functions, classes) from `service.ts`.
- **`export type * from './model'`** — re-exports all type definitions from `model.ts` as type-only exports (erased at compile time; no runtime import is generated).

## Relationships

- **`src/modules/wishlist/service.ts`** — source of all value re-exports.
- **`src/modules/wishlist/model.ts`** — source of all type re-exports.

Consumers (other modules) import from this file and should **not** import `service.ts` or `model.ts` directly.

## Notes

- The distinction between `export *` and `export type *` is intentional: model types are stripped at build time, keeping the runtime bundle free of type-only modules.
- Do not add direct imports of `./model` or `./service` from sibling modules; route through this index.
- Module-level documentation lives in `docs/modules/wishlist.md`; strategic context in `docs/theory/strategic-ddd.md`.
