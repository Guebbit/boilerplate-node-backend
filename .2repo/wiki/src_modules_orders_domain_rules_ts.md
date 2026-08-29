# src/modules/orders/domain/rules.ts

## Purpose

Pure domain-rule module for order-line validation. It takes candidate lines as data in and returns a discriminated-union verdict out — no HTTP status codes, no i18n strings. The caller (`service.ts`) is responsible for mapping verdicts to user-facing responses.

## Key elements

- **`OrderLineCandidate`** (interface) — the minimal shape the rules inspect per line. `product` is `unknown` and *optional*; its absence signals the product reference no longer resolves.
- **`OrderLinesVerdict`** (type) — discriminated union: `{ ok: true }`, or `{ ok: false; reason: 'no-lines' | 'product-missing' }`.
- **`checkOrderLines`** (function) — validates a readonly array of candidates. Checks are ordered: empty array → `no-lines`; any line with a nullish `product` → `product-missing`; otherwise `ok`.

## Relationships

- **`src/modules/orders/domain/index.ts`** — barrel file; re-exports the types and `checkOrderLines` so consumers import from the domain package root rather than this file directly.
- **`src/modules/orders/service.ts`** — the sole production caller. Maps `OrderLinesVerdict` reasons to status codes / i18n messages; this file deliberately avoids doing that mapping.
- **`src/modules/orders/tests/unit/domain-rules.test.ts`** — unit tests covering the `checkOrderLines` decision table (empty, missing product, valid set).

## Notes

- **Check order is intentional.** `no-lines` is tested before `product-missing` because the two reasons map to *different* status codes downstream. Reordering would change the HTTP response for an empty cart.
- **`product` is `unknown`, not a typed entity.** The rules layer never inspects product internals; it only tests for presence. Any deeper product validation belongs elsewhere.
- **Immutability contract.** The function accepts `readonly OrderLineCandidate[]` and mutates nothing; callers can pass a shared array without copy concerns.
- See `docs/theory/domain-layer.md` for the layering rules that keep this file free of transport/i18n concerns.
