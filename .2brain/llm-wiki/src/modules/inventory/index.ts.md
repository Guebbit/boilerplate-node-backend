---
source: src/modules/inventory/index.ts
sha256: e3c945026950c06963ed0e868284f24c726051ab0cd5c403a87bb876d260a767
generated_at: 2026-11-08T05:59:15.247626+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/index.ts

## Purpose

Public barrel (entry point) for the inventory module. It is the **only** surface a sibling module is permitted to import from, enforcing a narrow contract: sibling code requests a named transition and receives a boolean, with no visibility into the repositories, concrete models, or counter primitives that live inside the module. This encapsulation is intentional per `docs/theory/strategic-ddd.md` §5.

## Key elements

- `export * from './services'` — re-exports the inventory service layer (the transition-by-name API siblings call).
- `export * from './domain'` — re-exports domain logic (e.g., transition definitions, validation rules).
- `export * from './events'` — re-exports domain-event types/emitters.
- `export type * from './model'` — re-exports **type-only** members of the model layer; no runtime values from the model are leaked.

## Relationships

- **Cart services** (`src/modules/cart/services/checkout.ts`, `shelf.ts`, `view.ts`) — sibling modules that import from this barrel to query or mutate stock state during cart operations.
- **Cart integration tests** (`stock.test.ts`, `stock-flag.test.ts`, `backorder.test.ts`, `preorder.test.ts`, `merge.test.ts`, `checkout-expected-total.test.ts`) — exercise inventory transitions indirectly through the cart, asserting on the boolean outcomes exposed via this file.
- **Delivery module & tests** (`src/modules/delivery/module.ts`, `factories.ts`, `backorder.test.ts`, `lost-parcel.test.ts`, `override-sync.test.ts`, `preorder-board.test.ts`) — consume inventory types/events and trigger inventory transitions as part of parcel/delivery workflows.

## Notes

- The model layer is exported **type-only** (`export type *`). Importing a runtime value from `./model` through this barrel will fail at build time; that is the intended guardrail.
- No repositories, counter primitives, or mutable model instances are re-exported. If a sibling needs lower-level access, the architecture says it should not exist — route the need through a new named transition in `./services` instead.
- The module-level doc comment is normative: it documents *what must not be added* to this file, not just what is present.
