---
source: src/modules/addresses/index.ts
sha256: d2648330b70b1a33e863b1bc968229db0bf211ef0da475eca0b3bdefcdbb835e
generated_at: 2026-10-15T10:17:48.235428+00:00
model: ollama:qwen3.8:27b
---

# src/modules/addresses/index.ts

## Purpose

Public barrel for the Addresses module. It is the **only** entry point a sibling module may import from, enforcing the module-boundary rule described in `docs/theory/strategic-ddd.md` §5. It re-exports the module's public surface without adding any logic of its own.

## Key elements

- `export * from './service'` — re-exports **all values** (functions, classes, constants) from the service layer.
- `export type * from './model'` — re-exports **types only** (interfaces, type aliases, enums-as-types) from the domain model.
- `export type * from './presenter'` — re-exports **types only** from the presenter/view-model layer.

The distinction between `export *` and `export type *` keeps value-level imports limited to the service, preventing callers from reaching into the model or presenter at runtime.

## Relationships

- **`./service`, `./model`, `./presenter`** — source files that this barrel re-exports. External consumers never import these directly.
- **`src/modules/cart/services/checkout.ts`** — sibling module that imports the addresses public surface through this barrel (e.g. to read an address for a checkout flow).
- **`src/modules/cart/tests/integration/service.test.ts`** and **`src/modules/users/tests/integration/minimise.test.ts`** — integration tests that also resolve addresses types/values via this barrel rather than deep paths.

## Notes

- The file contains **no** executable code, no side effects, and no filtering. It is a pure re-export list. Adding or removing a name here changes the module's public API without touching any implementation file.
- Because the barrel is the sole import target, a rename or removal inside `service.ts`, `model.ts`, or `presenter.ts` will surface as a broken barrel export at build time—check this file when the build graph points at `addresses/index`.
- For the intended usage rules and examples, see `docs/modules/addresses.md` (referenced in the file header).
