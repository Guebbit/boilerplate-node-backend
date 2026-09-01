# src/modules/cart/domain/index.ts

## Purpose

Barrel entry point for the cart **domain layer**. It exists to give consumers a single stable import path while re-exporting the pure, framework-free rules defined in `rules.ts`. No logic lives here.

## Key elements

- **`evaluateCheckout`** — Re-exported from `./rules`. The sole public symbol of the domain layer; callers import it from this index rather than reaching into `rules.ts` directly.

## Relationships

- **`src/modules/cart/domain/rules.ts`** — Defines `evaluateCheckout`; this file is a thin re-export of that symbol.
- **`src/modules/cart/services/checkout.ts`** — Service-layer consumer; imports `evaluateCheckout` from this barrel (the service orchestrates, the domain evaluates).

## Notes

- The module docblock states the domain layer is **lint-guaranteed framework-free**. Keep any future re-exports here pure (no side effects, no framework imports) to preserve that invariant.
- The design rationale is documented in `docs/theory/domain-layer.md` (referenced in the file's JSDoc).
