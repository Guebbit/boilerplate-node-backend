---
source: src/modules/cart/domain/stock.ts
sha256: 39fcb6032861bde9637be888e3ff70f84fb7eb19f418ef5efdd19ba965d15c17
generated_at: 2026-10-29T03:21:56.083242+00:00
model: ollama:qwen3.8:27b
---

# src/modules/cart/domain/stock.ts

## Purpose

Single pure function that answers one question — does a cart line's quantity fit what is for sale? — shared by three call-sites (checkout pre-flight, merge, and cart view) so they cannot disagree. It intentionally imports nothing from sibling domain modules; `available` is passed in from the service layer.

## Key elements

- **`fitsStock(quantity, available)`** — The sole export. Returns `true` when `quantity <= available`. An unknown `available` (`null` / `undefined`) coerces to `0`, so the result is always `false` for any positive quantity. The function returns a boolean verdict only; it never produces a numeric stock figure.

## Relationships

- **`src/modules/cart/domain/index.ts`** — Barrel re-export; this module is surfaced through the domain's public entry point for consumers of the cart domain.
- **`src/modules/cart/tests/unit/stock-rule.test.ts`** — Unit tests that exercise `fitsStock`'s boundary cases (equal fits, unknown availability, zero quantity).
- **`src/modules/cart/domain/availability.ts`** — A sibling domain file, but this module does **not** import from it. The doc comment explicitly states the stock rule "reaches no sibling module"; availability data is supplied by the caller from the service layer.

## Notes

- **Safe-direction default:** when availability is unknown the function treats it as `0` (nothing sellable). This is a deliberate policy choice — being wrong on the "no" side is safer for a rule guarding a purchase.
- **No numeric leakage:** callers are contractually limited to the boolean. Exact stock counts remain behind the `read:StockLevel` authorization boundary (see `docs/theory/defences/authorization.md`).
- **Equality is allowed:** `quantity <= available` means a line whose quantity exactly matches stock is considered valid.
