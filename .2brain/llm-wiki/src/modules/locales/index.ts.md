---
source: src/modules/locales/index.ts
sha256: f1d40fa0f18e799852cf7a13d6dfc57e3547fe344346eaabf42a82ef4fb9d4cd
generated_at: 2026-11-08T06:22:59.312458+00:00
model: ollama:qwen3.8:27b
---

# src/modules/locales/index.ts

## Purpose

Public barrel for the **locales** module. It is the sole import surface that sibling modules may use (rule defined in `docs/theory/strategic-ddd.md` §5). Sibling code should never reach into `./model` or `./services` directly.

## Key elements

- **`export * from './services'`** — Re-exports the full value API of the services layer (per the doc comment, `localeService` is the only name expected to be consumed externally).
- **`export type * from './model'`** — Re-exports the type-only surface of the domain model (e.g. language-tag types).
- `deriveBaseLanguage` is deliberately **not** exported here; it remains internal to the module.

## Relationships

- **`src/modules/locales/model.ts`** — Type source. This barrel re-exports its types so consumers get a single import path.
- **`src/modules/locales/services/index.ts`** — Value source. This barrel re-exports everything it defines, making `localeService` (and any other service exports) available to sibling modules.
- **`src/modules/example/tests/integration/translations.test.ts`**, **`src/modules/products/tests/contract/api.contract.test.ts`**, **`src/modules/sitemap/tests/integration/sitemap.test.ts`** — Downstream consumers that import from this barrel rather than from internal paths.

## Notes

- The doc comment explicitly warns that there is no second, looser export list beside this one — keep the barrel minimal.
- `export type *` (not `export *`) is used for the model to prevent accidental value imports of types-only symbols.
- See `docs/modules/locales.md` for broader module documentation.
