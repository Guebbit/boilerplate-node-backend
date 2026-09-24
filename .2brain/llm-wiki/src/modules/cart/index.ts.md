---
source: src/modules/cart/index.ts
sha256: d9ae418f9d61d5b753f4e5b67b34f24b78dce1ab7d0cd3ceadc4f42b5180351f
generated_at: 2026-09-23T18:30:29.144819+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/index.ts

## Purpose

Public barrel file for the Cart module. It is the **only** import surface available to sibling modules (enforced by the strategic DDD boundary rule in `docs/theory/strategic-ddd.md` §5). It re-exports the service, domain, and type-level model APIs while deliberately keeping the repository and the model's runtime implementation internal, so sibling modules cannot bypass the service's business rules.

## Key elements

- `export * from './services'` — re-exports all public service functions/objects from `src/modules/cart/services/index.ts`.
- `export * from './domain'` — re-exports all public domain entities, value objects, and events from `src/modules/cart/domain/index.ts`.
- `export type * from './model'` — re-exports **type-only** declarations from `src/modules/cart/model.ts`; no runtime values are published, preventing direct construction of model instances outside the service.

## Relationships

- **Re-exports** `src/modules/cart/services/index.ts`, `src/modules/cart/domain/index.ts`, and `src/modules/cart/model.ts` (types only).
- **Consumed by** sibling modules and integration tests that need cart functionality: `src/modules/wishlist/service.ts`, `src/modules/wishlist/tests/integration/service.test.ts`, `src/modules/addresses/tests/integration/addresses.test.ts`, and `tests/integration/order-snapshot-locale.test.ts`. All of these must import cart APIs exclusively through this barrel.

## Notes

- The `type *` modifier on the model export is intentional: it makes the model's runtime (constructors, factories) invisible to importers. Attempting a value import from the model will fail at compile time.
- `cartRepository` is **not** re-exported here by design. Any code that needs to touch persistence directly is a boundary violation.
- For module-level documentation, see `docs/modules/cart.md`; for the general sibling-isolation rule, see `docs/theory/strategic-ddd.md` §5.
