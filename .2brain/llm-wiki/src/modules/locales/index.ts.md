---
source: src/modules/locales/index.ts
sha256: f1d40fa0f18e799852cf7a13d6dfc57e3547fe344346eaabf42a82ef4fb9d4cd
generated_at: 2026-09-23T18:49:42.871032+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/index.ts

## Purpose

Barrel file (public API surface) for the `locales` module. Enforces the strategic-DDB rule (§5) that sibling modules may only import through this file, not directly from internal subfolders.

## Key elements

- **`export * from './services'`** — Re-exports the full runtime API of the services subfolder (the public `localeService` entry point).
- **`export type * from './model'`** — Re-exports only the type declarations from `model.ts`, making them available to consumers without pulling runtime code.
- **`deriveBaseLanguage`** — Deliberately _not_ re-exported; remains internal to this module. No sibling module may call it.

## Relationships

- **`src/modules/locales/model.ts`** — Source of the type-only re-exports. This file is the sole public window into that module.
- **`src/modules/locales/services/index.ts`** — Source of the value re-exports (`localeService` and any other service-level exports). This file is the sole public window into that subfolder.

## Notes

- The `export type *` syntax (TypeScript 5+) means model exports vanish at compile time; no runtime cost.
- Per the doc-comment convention, adding a new public symbol here is the explicit, visible act of widening the module's API surface. Do not add a second barrel or "looser" re-export list alongside this one.
