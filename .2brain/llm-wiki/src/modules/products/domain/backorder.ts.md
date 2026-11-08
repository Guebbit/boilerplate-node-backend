---
source: src/modules/products/domain/backorder.ts
sha256: 93ec19e77ba206fa97f4df4c2f3531ef922d29e3f3f319d08cfa0e29d645cada
generated_at: 2026-11-08T07:43:20.066678+00:00
model: ollama:qwen3.8:27b
---

# src/modules/products/domain/backorder.ts

## Purpose

Pure domain rule that decides whether a RELEASED product may still be purchased while its shelf stock is empty (i.e., sold on backorder). All logic is a single derived boolean — no state is stored, and the clock is injected so every branch is testable in isolation.

## Key elements

- **`BackorderFacts`** (interface, exported) — the read-only slice of product state the rule needs. Extends `PreorderFacts` and adds `allowBackorder`, `restockDate`, `backorderLimit` (synced cap; `null` = uncapped), and `backordered` (units already owed).
- **`isBackorder(facts, now)`** (function, exported) — returns `true` only when *all* of the following hold: the `allowBackorder` switch is explicitly `true`; the product is active and purchasable; it is **not** a preorder; `restockDate` is absent or still in the future; and `preorderAllowanceLeft` reports room remaining under the cap.

## Relationships

- **`./preorder`** — imports `isPreorder` (to exclude preorders from backorder eligibility) and the `PreorderFacts` base type.
- **`./stock`** — imports `preorderAllowanceLeft` to compute remaining capacity under `backorderLimit` / `backordered`.
- **`./index.ts`** — barrel re-export; consumers of the products domain reach this file through the index.
- **`./tests/unit/backorder.test.ts`** — unit tests exercising every branch of `isBackorder` with a fixed `now`.
- **`products/presenter.ts`** — downstream consumer that surfaces the backorder flag to the UI layer.

## Notes

- "Absent reads as default" is a recurring convention: `allowBackorder` absent → `false`; `restockDate` absent → no expiry; `backorderLimit` absent → closed (no backorder), while `null` → uncapped.
- A *passed* `restockDate` is treated as sold-out (evidence the shop cannot honour a promise), not as "backorder is on."
- The function deliberately does **not** check current shelf stock; the cart/line layer decides how much spills past stock. Keep that separation intact.
- `isPreorder` is checked inside `isBackorder`, so a product can never qualify for both rules simultaneously.
