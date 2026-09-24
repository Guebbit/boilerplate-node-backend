---
source: src/modules/addresses/index.ts
sha256: f5e34f047e6ffb0f2986aac095d3f0d9810120a3e510c27753e223fef553fc94
generated_at: 2026-09-23T18:20:02.822297+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/index.ts

## Purpose

Public barrel (module facade) for the **Addresses** module. It is the *only* import surface a sibling module is allowed to use, enforcing the strategic-DDD boundary described in `docs/theory/strategic-ddd.md` §5. It re-exports the service's values and the model's types so consumers never reach into sub-paths directly.

## Key elements

- **`export * from './service'`** — Re-exports all value-level exports (classes, functions, constants) from `./service.ts` as the module's runtime API.
- **`export type * from './model'`** — Re-exports only the *type-level* exports (interfaces, type aliases, enums used as types) from `./model.ts`. Values defined in `model.ts` are intentionally hidden.

## Relationships

- **`src/modules/addresses/model.ts`** — Source of the type-only re-exports. Consumers get its types without importing the file directly.
- **`src/modules/addresses/service.ts`** — Source of the value re-exports; carries the module's runtime behavior.
- **`src/modules/cart/services/checkout.ts`** — Downstream consumer; imports from this barrel rather than from `./service` or `./model` directly, respecting the single-entry-point rule.

## Notes

- The `type` keyword on the model re-export is deliberate: it strips any value-level exports from `model.ts` (e.g., const enums, singleton objects), so consumers can only see types. If you need a value from `model.ts`, it must instead be surfaced through `service.ts`.
- Adding a new public export requires editing this file; there is no `export * from './utils'` catch-all. Keep the surface minimal.
