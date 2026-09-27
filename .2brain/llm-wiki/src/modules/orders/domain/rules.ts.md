---
source: src/modules/orders/domain/rules.ts
sha256: 825c66fc12669273e835f367e8b65cc0b62135b4d7d63007d303fd9b2e425433
generated_at: 2026-09-27T15:09:27.216970+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/domain/rules.ts

## Purpose
Pure validation and classification predicates for order lines. Takes already-joined line data in, returns a verdict or boolean out. No status codes, no i18n — the service layer (`services/place`) maps verdicts to HTTP/i18n responses. Lives in the domain layer per `docs/theory/domain-layer.md`.

## Key elements

- **`OrderLineCandidate`** — minimal shape a line must have for validation (`quantity?`, `product?`). Absent `product` signals a stale reference.
- **`OrderLinesVerdict`** — discriminated union: `{ ok: true }` | `{ ok: false, reason: 'no-lines' | 'product-missing' }`.
- **`checkOrderLines(lines)`** — validates a full set of candidate lines. Checks `no-lines` first, then `product-missing`. Returns the verdict.
- **`ShippableLineCandidate`** — narrower shape for shipping checks: only `product?.requiresShipping`.
- **`isShippedItem(line)`** — returns `true` unless `product.requiresShipping` is explicitly `false`. Absent field defaults to shipped (mirrors the product schema default).
- **`isDigitalOnlyOrder(lines)`** — `true` only when the set is non-empty **and** every line is non-shippable. An empty set is *not* digital-only.

## Relationships

- **`src/modules/orders/services/place.ts`** — consumes `checkOrderLines` and maps the `reason` string to the appropriate status code / i18n message.
- **`src/modules/orders/domain/index.ts`** — barrel re-exports these symbols so consumers can import from the domain package root.
- **`src/modules/orders/domain/tax.ts`** — sibling in the same domain module; shares the "pure predicate, no side-effects" convention.
- **`src/modules/delivery/service.ts`** — likely consults `isShippedItem` / `isDigitalOnlyOrder` to decide whether to route an order through the ship/deliver pipeline or straight to `fulfill`.
- **`src/modules/cart/services/checkout.ts`** — upstream of these rules; its `isShippedLine` (in `cart/domain/rules.ts`) is the pre-freeze twin of `isShippedItem`, applied to cart-line shapes rather than the order's embedded product snapshot.
- **`src/modules/orders/tests/unit/domain-rules.test.ts`** — unit tests covering `checkOrderLines` verdict ordering and the `isShippedItem` / `isDigitalOnlyOrder` edge cases.

## Notes

- **Check order is significant.** `no-lines` is evaluated before `product-missing`; the two reasons map to different status codes downstream, so reordering the checks changes observable behavior.
- **`isShippedItem` is intentionally a copy, not a shared import, of cart's `isShippedLine`.** The two modules operate on different post-freeze shapes (order's embedded snapshot vs. joined cart line), so the predicates live side-by-side rather than being extracted.
- **Empty-set asymmetry.** `checkOrderLines([])` → refused; `isDigitalOnlyOrder([])` → `false`. Both are deliberate: an empty order is neither valid nor "digital."
- **`product` is typed `unknown`.** The rules deliberately avoid depending on the full product type; they only check presence and the single `requiresShipping` field.
