# src/modules/cart/domain/index.ts

## Purpose

Barrel file for the cart **domain layer**. It re-exports the public API of `./rules` so that consumers can import from `cart/domain` without reaching into submodules. The domain layer is intended to be pure, framework-free logic (enforced by lint rules); this index file is the single entry point for that contract.

## Key elements

- **`evaluateCheckout`** — Re-exported function (from `./rules`). Performs the core checkout evaluation logic.
- **`CartLineCandidate`** (type) — Re-exported from `./rules`. Represents a line item under consideration during checkout.
- **`CheckoutVerdict`** (type) — Re-exported from `./rules`. The result/outcome of a checkout evaluation.
- **`CheckoutShortfall`** (type) — Re-exported from `./rules`. Describes a shortfall detected during evaluation.

All four exports originate from `./rules`; this file adds no logic of its own.

## Relationships

- **`src/modules/cart/domain/rules.ts`** — Sole source of every export in this file. The index simply re-exports its named function and types.
- **`src/modules/cart/services/checkout.ts`** — Downstream consumer in the services layer that imports from this barrel (or the domain layer) to invoke `evaluateCheckout` and work with the exported types.

## Notes

- The header comment states the domain layer is **lint-guaranteed framework-free**. Any new export added here must come from code that satisfies that constraint; the barrel does not relax it.
- For architectural rationale, see `docs/theory/domain-layer.md` (referenced in the file comment).
- Because this is a pure re-export barrel, there is no runtime state or side effect to worry about—importing from `cart/domain` is equivalent to importing from `cart/domain/rules`.
