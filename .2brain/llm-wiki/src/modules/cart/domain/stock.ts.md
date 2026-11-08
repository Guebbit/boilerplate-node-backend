---
source: src/modules/cart/domain/stock.ts
sha256: 39fcb6032861bde9637be888e3ff70f84fb7eb19f418ef5efdd19ba965d15c17
generated_at: 2026-11-08T05:13:41.114443+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/domain/stock.ts

## Purpose

Defines the cart's single stock-fit rule as a pure function. It exists so that checkout pre-flight, cart merge, and the cart view all share one definition of "does this line's quantity fit what is for sale," preventing the three call sites from drifting apart.

## Key elements

- **`fitsStock(quantity, available): boolean`** — The only export. Returns `true` when `quantity <= available`. Treats `null`/`undefined` `available` as `0` (i.e., only a zero-quantity line fits). The result is a plain boolean verdict; callers are expected to convert it into a refusal or a flag, never into a numeric stock count.

## Relationships

- **`src/modules/cart/domain/index.ts`** — Barrel file for the cart domain; re-exports `fitsStock` so callers outside the domain directory can import it without a deep path.
- **`src/modules/cart/tests/unit/stock-rule.test.ts`** — Unit tests that exercise the boundary cases of `fitsStock` (exact fit, over-quantity, `null`/`undefined` availability, zero quantity).
- **`src/modules/cart/domain/availability.ts`** — Sibling domain rule in the same folder. `stock.ts` deliberately does *not* import from it; the `available` value is supplied by the caller from the service layer (`inventoryService.availableFor`). The two files co-locate related availability concepts without a direct dependency.

## Notes

- The `?? 0` coercion means an unknown availability is treated as "nothing to sell." This is an intentional safe-default: erring on the side of refusing a purchase is preferred over silently allowing it.
- `fitsStock` is strictly a boolean gate. The module docstring explicitly forbids callers from using it to derive a numeric stock level—that path belongs to whoever holds the `read:StockLevel` authorization (see `docs/theory/defences/authorization.md`).
- The function is pure (no I/O, no side effects) so it is trivially testable and reusable across the three call sites without coordination.
