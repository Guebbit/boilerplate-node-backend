---
source: src/modules/locales/index.ts
source_sha256: 08e4b800c99f8630439bc0925c269e5e8417bda3d1f2ad3e3ae1009275a2a77b
context_sha256: af53e4ffd7ac0b4dcc149c14aa31af2c74dbbd26300b77be4771abca1ab53d8d
generated_at: 2026-11-22T05:44:49.063102+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/locales/index.ts

## Purpose
Public barrel for the Locales module. It defines the only surface that sibling modules may import from `locales`, re-exporting the service layer and the module's types.

## Key elements
- `export * from './services'`: re-exports everything from the services barrel. Per the file's doc comment, `localeService` is the only name outside `services/` that anything imports.
- `export type * from './model'`: re-exports the model's types only, with no runtime values.

## Relationships
- `src/modules/locales/services/index.ts`: source of the runtime exports (`localeService`).
- `src/modules/locales/model.ts`: source of the type-only exports.
- `src/modules/example/tests/integration/translations.test.ts`, `src/modules/products/tests/contract/api.contract.test.ts` and `tests/integration/sitemap-languages.test.ts` are listed as graph neighbors. They are presumably consumers of this barrel, but the file content does not show how they use it.

## Notes
- `deriveBaseLanguage` is deliberately not exported. The doc comment says nothing outside this module resolves a language tag.
- The doc comment points to external documentation sections (a "neighbourhood" section for the locales module and a "published language — the barrel" section on strategic DDD) for the import rule and its rationale. Those documents are not part of the listed graph neighbors.
