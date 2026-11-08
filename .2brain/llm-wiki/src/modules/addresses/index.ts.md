---
source: src/modules/addresses/index.ts
sha256: d2648330b70b1a33e863b1bc968229db0bf211ef0da475eca0b3bdefcdbb835e
generated_at: 2026-11-08T04:54:38.798392+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/index.ts

## Purpose

Barrel (public API) file for the **Addresses** module. It is the single import surface that sibling modules are permitted to use, enforcing the strategic-DDD rule that cross-module access goes through the module's public facade rather than reaching into its internals.

## Key elements

- **`export * from './service'`** — Re-exports all value exports (functions, classes, constants) from the service layer.
- **`export type * from './model'`** — Re-exports only *type* declarations (interfaces, type aliases, enums) from the domain model. No runtime values leak through.
- **`export type * from './presenter'`** — Re-exports only *type* declarations from the presenter/view-model layer.

## Relationships

- **`src/modules/addresses/service.ts`** — Source of all value exports; the functional core of the module.
- **`src/modules/addresses/model.ts`** — Source of type-only exports (domain entities, value objects).
- **`src/modules/addresses/presenter.ts`** — Source of type-only exports (DTOs / view-model shapes).
- **`src/modules/cart/services/checkout.ts`**, **`src/modules/cart/tests/integration/service.test.ts`**, **`src/modules/users/tests/integration/minimise.test.ts`** — External consumers that import the Addresses module exclusively through this barrel.

## Notes

- The `type` qualifier on the `model` and `presenter` re-exports is intentional: only compile-time shapes cross the boundary. Runtime implementations stay private to the module.
- The header comment points to `docs/theory/strategic-ddd.md` §5 for the import rule and to `docs/modules/addresses.md` for module-level documentation.
- Because this is a pure re-export file, there is no logic, state, or side effects here.
