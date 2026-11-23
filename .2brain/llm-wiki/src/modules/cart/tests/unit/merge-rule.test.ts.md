---
source: src/modules/cart/tests/unit/merge-rule.test.ts
source_sha256: dba1de48a48399da9a54f4f0ff5562ec2d00edc619eb3e3f67df929c5c358f23
context_sha256: 6f52cc7dfda46b2f1b87a2ef78e58241f8d80359c59d06b948d33202fa38b7c2
generated_at: 2026-11-22T04:43:20.389733+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/cart/tests/unit/merge-rule.test.ts

## Purpose
Unit tests for `planMergeLine`, the cart domain's merge rule. They run with no mocks and no database. They pin which reason wins when several apply, and they check invariants over a grid of inputs so boundary cases are covered. Stock is deliberately not an input: the rule adds what `POST /cart` would, and the shared `fitsStock` rule flags the result.

## Key elements
- `LINE_MAX` (999): the per-line ceiling, "as the model declares it".
- `MAX_LINES` (100): the line limit used in these cases.
- `plan(facts)`: a helper that calls `planMergeLine` with defaults `listed: true` and `lines: 0`, plus the fixed `lineMax` and `maxLines`. Each case supplies only `requested` and `held`, and optionally `listed` and `lines`.
- Named cases and the results they expect:
  - Nothing held: `{ add: requested }`, no reason.
  - Product already held: reason `summed`.
  - Sum would pass the ceiling: reason `capped`, adding only what fits. This also covers a line already at the ceiling and a single request above it.
  - Landing exactly on the ceiling: no reason.
  - Product not listed: `add: 0`, reason `removed`.
  - New product in a full cart: `add: 0`, reason `cart_full`.
  - A line the full cart already holds can still grow (`summed`).
- Precedence block: `removed` > `cart_full` > `capped` > `summed`, with one case per pair.
- Grid block: `it.each` over requested × held × listed, 5 × 5 × 2 combinations.
  - Invariants: `add >= 0`, `held + add <= LINE_MAX`, `add <= requested`, and an unlisted product adds nothing.
  - A reason is present exactly when the line did not land as asked, meaning not listed, `add !== requested`, or `held !== 0`.

## Relationships
- Imports `planMergeLine` and the `MergeLineFacts` type from `src/modules/cart/domain/index.ts`. The rule itself is implemented in `src/modules/cart/domain/merge.ts`, which that index serves.
- `scenarios/products.ts` and `src/modules/locales/services/translations.ts` are graph neighbors, but this file does not use them.

## Notes
- The "grid" quantities and holdings stay at or below 999, so the grid never exercises a request above the ceiling. The named cases cover that, as with the `1000` request.
- The reason test treats `held === 0` as part of "landed as asked", so any held quantity yields a reason, which is `summed` at minimum.
