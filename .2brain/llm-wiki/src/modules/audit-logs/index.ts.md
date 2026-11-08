---
source: src/modules/audit-logs/index.ts
sha256: 48f6b6c18b2f577f90f025255a2c46d403ea47261067c669aefe12177eee1b80
generated_at: 2026-11-08T05:07:39.568448+00:00
model: ollama:qwen3.8:27b
---

# src/modules/audit-logs/index.ts

## Purpose

Barrel (public API) file for the audit-logs module. It is the **only** surface a sibling module is allowed to import from, enforcing the strategic-DDD boundary rule described in `docs/theory/strategic-ddd.md` §5. It exposes the module's service values and model types in a single re-export statement.

## Key elements

- `export * from './service'` — Re-exports all **value** bindings (classes, functions, etc.) from `service.ts`.
- `export type * from './model'` — Re-exports all **type-only** bindings (interfaces, type aliases) from `model.ts`. Using `export type` ensures these are erased at compile time and do not appear in the emitted JS.

## Relationships

- **`src/modules/audit-logs/service.ts`** — Source of all value exports. Importers of this barrel get the service's runtime API.
- **`src/modules/audit-logs/model.ts`** — Source of all type exports. Importers get the domain types without a runtime import cost.
- **`src/modules/observability/controllers/get-observability-audit.ts`** — Downstream consumer; imports through this barrel rather than reaching into `service.ts` or `model.ts` directly.

## Notes

- The doc comment references `module.ts` as the file that "registers the write path itself at import time." `module.ts` is **not** re-exported from this barrel; it is a separate entry point with a side-effect import, not part of the public surface.
- The type-only re-export (`export type *`) is intentional: consumers of the model types never pull a runtime dependency on `model.ts`.
- See `docs/modules/audit-logs.md` for the broader module design context.
