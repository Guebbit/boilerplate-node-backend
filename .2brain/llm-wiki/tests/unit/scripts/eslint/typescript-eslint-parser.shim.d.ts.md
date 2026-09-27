---
source: tests/unit/scripts/eslint/typescript-eslint-parser.shim.d.ts
sha256: bccfbe833a3d379735c1dca3d90c534568aa6d9de9e618df6e32a39367157514
generated_at: 2026-09-27T16:13:36.025335+00:00
model: ollama:qwen3.8:27b
---

# tests/unit/scripts/eslint/typescript-eslint-parser.shim.d.ts

## Purpose

Ambient module declaration that re-exports `@typescript-eslint/parser` through a relative path into `node_modules`, working around ts-jest's `node16` module resolver (pinned at 29.4.9). It exists so TypeScript can resolve the parser's types during test compilation without hitting the resolver's limitations.

## Key elements

- **`declare module '@typescript-eslint/parser'`** — ambient declaration that maps the bare specifier to a concrete file path.
- **`export * from '../../../../node_modules/@typescript-eslint/parser/dist/index'`** — re-exports all named exports from the parser's actual `dist` entry point.
- **`export { default } from '…'`** — re-exports the default export from the same entry point.

## Relationships

No dependency-graph neighbors. The header comment cross-references `docs/reference/tests.md#why-ts-jest-stays-pinned-at-29-4-9` for the underlying rationale and notes that the same ts-jest pin is shared with `@casl/ability`.

## Notes

- The relative path (`../../../../node_modules/…`) is a deliberate workaround for ts-jest's `node16` resolver, not a normal import style. If the package layout or ts-jest version changes, this shim may need updating or removal.
- Both a star re-export **and** an explicit default re-export are required; omitting either breaks type resolution for consumers that import the default.
- See the referenced doc section for why ts-jest stays at 29.4.9 — upgrading without updating this shim (and the `@casl/ability` counterpart) will likely break test type-checking.
