---
source: src/modules/inventory/index.ts
sha256: e3c945026950c06963ed0e868284f24c726051ab0cd5c403a87bb876d260a767
generated_at: 2026-10-14T15:54:39.465621+00:00
model: ollama:qwen3.8:27b
---

# src/modules/inventory/index.ts

## Purpose

Public barrel (re-export surface) for the Inventory module. It is the **only** entry point a sibling module is permitted to import, enforcing a narrow contract: callers may request a named transition and receive a boolean result, while all internal counter mechanics, repository implementations, and model values stay encapsulated within the module.

## Key elements

- `export * from './services'` — re-exports the service layer (transition functions, etc.).
- `export * from './domain'` — re-exports domain logic.
- `export * from './events'` — re-exports inventory event definitions.
- `export type * from './model'` — re-exports **type-only** members from the model; no model values are exposed.

## Relationships

- **Cart services** (`checkout.ts`, `shelf.ts`, `view.ts`) and **delivery** (`module.ts`) are the primary consumers: they import transitions/types through this barrel rather than reaching into sub-paths.
- **Cart and delivery integration tests** (e.g. `stock.test.ts`, `preorder.test.ts`, `override-sync.test.ts`, `checkout-expected-total.test.ts`) exercise the surface exported here.
- **`scripts/ops/sweep-reservations.ts`** is an operational script that relies on inventory transitions exposed through this barrel.

## Notes

- The model sub-path is exported with `export type *` specifically so that model **values** (entities, factories) never leak to siblings. Only TypeScript types cross the boundary.
- The deliberate absence of repositories and counter primitives is a design rule, not an oversight. Publishing them would let siblings bypass the "ask by name, get a boolean" contract (see `docs/theory/strategic-ddd.md` §5).
- If a new sibling module needs an inventory interaction, the correct path is to add a named transition to `./services` and let this barrel re-export it — do not add a direct import of a sub-path.
