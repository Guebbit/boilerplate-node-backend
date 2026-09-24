---
source: src/modules/orders/index.ts
sha256: 93ec780817e0d6ef6103922ee4e0ee179d79f8ea18100cee4780b9160bab384c
generated_at: 2026-09-23T19:03:33.620156+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/index.ts

## Purpose

Public barrel for the orders module. It is the **only** surface sibling modules may import from (per `docs/theory/strategic-ddd.md` §5). It re-exports the module's services, domain types, events, email helpers, and model types so that internal details (the repository, the collection) stay private.

## Key elements

- **`export * from './services'`** — re-exports the service layer (including `placeOrder`, the sole write-path for creating a new order).
- **`export * from './domain'`** — re-exports domain types/abstractions.
- **`export * from './events'`** — re-exports event definitions.
- **`export * from './emails'`** — re-exports email-related helpers/types.
- **`export type * from './model'`** — re-exports **types only** from the model (no runtime values leak out).

## Relationships

- **`src/modules/orders/domain/index.ts`**, **`src/modules/orders/events.ts`**, **`src/modules/orders/emails.ts`**, **`src/modules/orders/model.ts`** — directly re-exported by this barrel; any sibling module importing from `@modules/orders` resolves through these files.
- **`src/modules/cart/services/checkout.ts`** — the doc comment explicitly names cart's checkout (and this module's own `create`) as callers of `placeOrder`; neither writes to the order collection directly.
- The barrel's doc comment delegates the reach-into-`users` interactions (`USER_DELETED`, `userService.getById`) to the orders module's `module.ts`, keeping them out of this file's contract.

## Notes

- `model` is exported with `export type *`, so importing a **value** from `./model` through this barrel will fail — only types are available.
- `orderRepository` is deliberately **not** re-exported; direct collection access is an internal concern.
- The file contains no logic of its own; behavior changes will appear in the re-exported submodules, not here.
