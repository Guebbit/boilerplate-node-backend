---
source: src/modules/inventory/index.ts
sha256: fece5b9dad78b03c858113d1fd94cb1d5ec4d83dabab6ba426f512388e8af163
generated_at: 2026-09-23T18:44:41.473712+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/index.ts

## Purpose

Public barrel (re-export) for the inventory module. Per the strategic-DDBD rule in `docs/theory/strategic-ddd.md` §5, this is the **only** entry point a sibling module may import from. It intentionally exposes just the service, domain, and events surfaces plus type-only model exports, while withholding repositories, concrete model values, and all counter primitives so that siblings can request a named transition and receive a boolean without touching internal stock mechanics.

## Key elements

- `export * from './service'` — re-exports the inventory service (transition methods).
- `export * from './domain'` — re-exports domain rules/logic from `./domain/index.ts`.
- `export * from './events'` — re-exports inventory domain events.
- `export type * from './model'` — **type-only** re-export of model definitions; no runtime values leak.

## Relationships

- **`src/modules/inventory/service.ts`**, **`src/modules/inventory/domain/index.ts`**, **`src/modules/inventory/events.ts`**, **`src/modules/inventory/model.ts`** — the four sub-modules re-exported here; this file is their sole public surface to the rest of the codebase.
- **`src/modules/orders/services/*`** (`place`, `cancel`, `retract`, `override`, `crud`) and **`src/modules/orders/module.ts`** — sibling modules that consume inventory transitions through this barrel.
- **`src/modules/payments/services/settlement.ts`** — payments settlement logic that interacts with inventory via this surface.
- **`src/modules/cart/tests/*`** and **`src/modules/orders/tests/*`** — integration/contract tests that exercise inventory behavior through this import path.

## Notes

- `model.ts` is re-exported with `export type *`, so consumers can reference types (e.g., `StockLevel`) but cannot import runtime model instances. This is the mechanism that "takes away" counter manipulation from siblings.
- Adding a new `export *` line here widens the public API for the entire codebase; the doc comment explicitly warns against publishing repositories or counter primitives.
- See `docs/modules/inventory.md` for the module's full design rationale.
