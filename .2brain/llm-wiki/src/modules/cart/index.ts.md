---
source: src/modules/cart/index.ts
source_sha256: e8277f3eba81cf3e41390df566d5a004ca9a23f7ee8565f954df1320c251fb1b
context_sha256: b3c0a802fcf661f07eb5b2dac00e5d98f06610582f4b76e34ff7131aee6d82bb
generated_at: 2026-11-22T04:33:06.780104+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/index.ts

## Purpose
Public barrel for the cart module. Per its header comment, it is the only surface a sibling module may import. It re-exports the service layer, events, and domain, plus type-only exports of the model and presenter. It exists to enforce module boundaries.

## Key elements
- `export * from './services'`: runtime exports of the cart services.
- `export * from './events'`: runtime exports of the cart events.
- `export * from './domain'`: runtime exports of the cart domain.
- `export type * from './model'`: the model's types only, with no runtime.
- `export type * from './presenter'`: the presenter's types only.

## Relationships
- Re-exports from `./services` (`src/modules/cart/services/index.ts`), `./events` (`src/modules/cart/events.ts`), `./domain` (`src/modules/cart/domain/index.ts`), `./model` (`src/modules/cart/model.ts`) and `./presenter` (`src/modules/cart/presenter.ts`).
- Sibling and test files in the neighbor list (`src/modules/shop-tasks/module.ts`, `src/modules/wishlist/service.ts`, and the integration tests) are related to this file through the dependency graph. They are presumably consumers of the barrel, but the file's content does not show how they use it.

## Notes
- `cartRepository` and the model's runtime are deliberately not exported. According to the header comment, exporting either would let a sibling bypass the service's rules.
- Model and presenter are exported with `export type *`, so only their types are visible outside the module.
- The header comment points to documentation sections on the module's neighbourhood and on the barrel as the module's published language for the rule behind this.
