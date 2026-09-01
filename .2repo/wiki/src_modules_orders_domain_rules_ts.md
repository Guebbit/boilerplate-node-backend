# src/modules/orders/domain/rules.ts

## Purpose

Pure validation rules for order lines. Given a set of candidate lines, it produces a typed verdict (`ok` or a specific refusal reason) with no side effects, no HTTP status codes, and no i18n strings. The separation ensures business logic stays testable in isolation while `service.ts` handles presentation concerns.

## Key elements

- **`OrderLineCandidate`** — minimal shape the rules operate on: an optional `quantity` and an optional `product` (absence of `product` signals a failed reference lookup).
- **`OrderLinesVerdict`** — discriminated union: `{ ok: true }` or `{ ok: false; reason: 'no-lines' | 'product-missing' }`.
- **`checkOrderLines(lines)`** — the single rule. Returns `no-lines` if the array is empty, `product-missing` if any line's `product` is `undefined`/`null`, otherwise `ok`.

## Relationships

- **`src/modules/orders/domain/index.ts`** — barrel file that re-exports `OrderLineCandidate`, `OrderLinesVerdict`, and `checkOrderLines` so callers import from the domain entry point rather than reaching into individual rule files.
- **`src/modules/orders/service.ts`** — calls `checkOrderLines` and maps each `reason` string to the corresponding HTTP status code / error response. This file must never import from `service.ts` (dependency flows one way: service → domain).
- **`src/modules/orders/tests/unit/domain-rules.test.ts`** — unit-tests `checkOrderLines` against the three verdict outcomes.

## Notes

- Evaluation order in `checkOrderLines` is intentional: `no-lines` is checked before `product-missing` because the two reasons map to *different* status codes downstream. Reordering the guards would silently change API behavior.
- `product` is typed `unknown`, not a concrete product interface — the rules deliberately avoid depending on the product domain type; they only need to know "present or not."
- The module docblock references `docs/theory/domain-layer.md` for the broader rationale behind the pure-verdict pattern.
