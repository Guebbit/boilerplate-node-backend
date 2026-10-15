---
source: src/modules/cart/domain/stock.ts
sha256: 42e520bbfbeae3fcd3758cbd1af2bc6bdb2e7ecad261b725d43c8c62a85ff29e
generated_at: 2026-10-15T10:23:17.983012+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/domain/stock.ts

## Purpose

Pure stock-checking rule for the cart: determines whether a line's quantity fits what is currently for sale. Exists as a single shared predicate so that checkout pre-flight, cart merge, and the cart view all agree on the same verdict without re-implementing the logic.

## Key elements

- **`fitsStock(quantity, available)`** (exported const) — Returns `true` when `quantity <= (available ?? 0)`. Accepts `available` as `number | null | undefined`; `null`/absent means "unknown or gone" and is treated as `0`, so nothing fits. No side effects, no imports from sibling modules.

## Relationships

- **`src/modules/cart/domain/availability.ts`** — Upstream data source. The service layer reads the stock ledger via `inventoryService.availableFor` and passes the result into `fitsStock`. This file does **not** import availability.ts; it stays pure and receives the value as a parameter.
- **`src/modules/cart/domain/index.ts`** — Barrel file; re-exports `fitsStock` for consumers of the cart domain.
- **`src/modules/cart/tests/unit/stock-rule.test.ts`** — Unit tests covering the predicate's behavior (equal-quantity boundary, `null`/`undefined` availability, over-stock).

## Notes

- **Verdict is boolean, never a number.** Callers must not derive an exact stock count from this function; exact figures belong to whoever holds `inventory.any.read` (see `docs/theory/defences/authorization.md`).
- **Safe-wrong direction:** when availability is unknown (`null`/absent), the rule returns `false` ("nothing to sell"). This is intentional for a guard that protects a purchase.
- **Three fixed callers** (checkout pre-flight → refuse; merge → flag result; cart view → flag every line) are the only sanctioned consumers. Adding a new caller is a design decision, not a refactor.
