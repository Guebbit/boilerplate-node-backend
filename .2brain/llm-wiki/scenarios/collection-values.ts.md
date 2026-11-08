---
source: scenarios/collection-values.ts
sha256: 22ccfa8e45dd7594b7e8194be4f1006140d6ee2dc2ede86234ffe53581ecf55c
generated_at: 2026-11-08T02:28:07.576066+00:00
model: ollama:qwen3.8:27b
---

# scenarios/collection-values.ts

## Purpose

Defines the `CollectionValues` interface — the contract each module's fixture file uses to contribute example values to the generated API client's collections. The bundler scans `scenarios/values/<module>.ts`, reads whatever each file exports as `collectionValues`, and merges them; this file is the shared type that makes that merge well-typed without any central registry naming individual modules.

## Key elements

- **`CollectionValues`** (interface, exported) — the only export. Three optional members:
  - `byProperty` — `Readonly<Record<string, string | number | boolean>>`. Maps a property name to the value to inject wherever a generated request body or query carries that property.
  - `tokens` — `Readonly<Record<string, string>>`. Names available `{{token}}` placeholders and what each resolves to.
  - `pathParam` — callback `(name: string, template: string) => string | undefined`. Supplies a value for a path parameter; returning `undefined` signals the module has no opinion.

## Relationships

- **`scenarios/values/cart.ts`**, **`scenarios/values/orders.ts`**, **`scenarios/values/products.ts`** — each of these fixture files exports a `collectionValues` object typed as `CollectionValues` (or a subset). They are the per-module consumers of this interface.
- **`scripts/contracts/client-collections-bundle.ts`** — the bundler script that imports the `CollectionValues` type, scans the `scenarios/values/` directory, collects each module's `collectionValues` export, and merges them into the generated client collections output.

## Notes

- The file is purely a type declaration; it has no runtime exports. All "wiring" (which module provides which values) is discovered by directory scan in the bundler, not by an explicit import list.
- `pathParam` is the only non-serializable member (a function), so it cannot be JSON-round-tripped; the bundler must invoke it rather than clone it.
- The doc comments explicitly state that module values "leave with it" — if a module directory is deleted, its `CollectionValues` contribution disappears with no cleanup needed elsewhere.
