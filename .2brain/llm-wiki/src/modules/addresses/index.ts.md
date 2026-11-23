---
source: src/modules/addresses/index.ts
source_sha256: 8612148c1fcb2eb19b43cea9481c9fb67ab7e98db06f1d70e6124227ecf7ef95
context_sha256: 067d5767328ded482394ec452d93a53daf1662d5966d086bb84f3ac1c812a26c
generated_at: 2026-11-22T04:13:38.510913+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/addresses/index.ts

## Purpose
Public barrel for the addresses module. It is documented as the only surface a sibling module may import, which keeps the module's internals encapsulated (the "published language" rule referenced in its header comment).

## Key elements
- `export * from './service'`: re-exports everything from the service, both runtime values and types.
- `export type * from './model'`: re-exports the model's types only.
- `export type * from './presenter'`: re-exports the presenter's types only.

## Relationships
- `service.ts`: its exports are fully re-exported, so this is the only part of the module's runtime API visible through the barrel.
- `model.ts` and `presenter.ts`: only their types are exposed. The `export type *` form means no runtime values from them pass through the barrel.
- `src/modules/cart/services/checkout.ts`, `src/modules/cart/tests/integration/service.test.ts` and `src/modules/users/tests/integration/minimise.test.ts`: these neighbors are linked to the barrel in the dependency graph, so they are consumers from outside the module. I can't tell from this file which symbols they use.

## Notes
- The file contains no logic, only re-exports. To change what other modules can see, edit this file.
- Because model and presenter are re-exported as type-only, anything runtime-level that other modules need must be exported from `service.ts`.
