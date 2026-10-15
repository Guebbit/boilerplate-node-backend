---
source: src/modules/wishlist/index.ts
sha256: 0f22743dd22e8bb53819fc5c6a148ebefb06865a88ed5dc0a37b7a42ae1146bb
generated_at: 2026-10-15T12:26:17.502134+00:00
model: ollama:qwen3.8:27b
---

# src/modules/wishlist/index.ts

## Purpose

Public barrel (re-export facade) for the wishlist module. It is the **only** import surface that sibling modules are permitted to use, enforcing the strategic-DDD boundary rule documented in `docs/theory/strategic-ddd.md` §5. It exposes no logic of its own.

## Key elements

- **`export * from './service'`** — Re-exports all value bindings (functions, classes) from the service layer.
- **`export * from './events'`** — Re-exports all value bindings (event definitions, emitters) from the events layer.
- **`export type * from './model'`** — Re-exports *type-only* bindings (interfaces, type aliases) from the domain model. No runtime values are leaked.
- **`export type * from './presenter'`** — Re-exports *type-only* bindings (view-model contracts) from the presenter. No runtime values are leaked.

## Relationships

- **`src/modules/wishlist/service.ts`, `events.ts`, `model.ts`, `presenter.ts`** — Direct re-export sources; this file adds no transformation, only selects what is visible externally.
- **`src/modules/notifications/module.ts`** — Consumes the wishlist barrel (imports services/events/model types) rather than reaching into individual wishlist files.
- **`src/modules/notifications/tests/integration/events.test.ts`** — Imports wishlist events via this barrel to assert cross-module event contracts.

## Notes

- The `export type *` vs `export *` distinction is deliberate: `model` and `presenter` are type-only contracts; importing a value from them at runtime is a compile error. This keeps the domain model and view-model layers unimportable as runtime dependencies from outside the module.
- Because this file is a pure re-export, it has no side effects and is safe to import in test files without triggering module initialization beyond what the underlying modules already do.
