---
source: src/modules/orders/domain/rules.ts
sha256: ab8af8bbcf1e688cb3b6127817f38ee01854bac30a9a2555546b09023b55a925
generated_at: 2026-10-29T04:40:27.394372+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/domain/rules.ts

## Purpose

Pure predicate and validation functions for order data. Each export takes structured input (lines, buyer references) and returns a plain verdict or boolean — no status codes, no i18n, no I/O. The service layer (primarily `services/place`) is responsible for translating verdicts into HTTP responses or side effects. See `docs/theory/domain-layer.md` for the design rationale.

## Key elements

- **`OrderLineCandidate`** — Minimal shape a line must satisfy for validation (`quantity`, optional `product`). Absent `product` signals a broken reference.
- **`OrderLinesVerdict`** — Discriminated union: `{ ok: true }` or `{ ok: false, reason: 'no-lines' | 'product-missing' }`.
- **`checkOrderLines(lines)`** — Validates a set of candidate lines. Order of checks matters: empty array → `'no-lines'`; any null/undefined `product` → `'product-missing'`; otherwise `ok`.
- **`HasBuyer`** (internal) — Structural type for anything carrying `userId` (string, ObjectId, or null).
- **`buyerIdOf(order)`** — Normalises the order's `userId` to `string | undefined`. The single point where an ObjectId or raw string buyer reference becomes a plain string.
- **`isBuyer(order, caller)`** — True only when the caller has an id that matches the order's buyer. Returns `false` for erased buyers (null/undefined `userId`) or callers with no id.
- **`ShippableLineCandidate`** — Minimal shape exposing `product?.requiresShipping`.
- **`isShippedItem(line)`** — True unless `product.requiresShipping` is explicitly `false`. Absent field defaults to shipped (matching the product schema default).
- **`isDigitalOnlyOrder(lines)`** — True when the order has ≥ 1 line and *every* line is non-shipped. An empty line set is never digital-only.

## Relationships

- **`src/modules/orders/services/place.ts`** — Consumes `checkOrderLines` and maps the two refusal reasons to distinct HTTP status codes.
- **`src/modules/orders/domain/index.ts`** — Barrel re-export; the public surface of the order domain.
- **`src/modules/delivery/services/ensure.ts` / `notice.ts`** — Rely on `isDigitalOnlyOrder` / `isShippedItem` to decide whether delivery steps apply.
- **`src/modules/orders/services/cancel.ts` / `override.ts` / `actions.ts`** — Use `isBuyer` / `buyerIdOf` for authorisation and account scoping.
- **`src/modules/invoicing/services/for-caller.ts` / controllers** — Use `buyerIdOf` to bind invoices and credit notes to the correct account.
- **`src/modules/orders/emails.ts`** — Uses `isDigitalOnlyOrder` to gate fulfillment-vs-delivery messaging.

## Notes

- `checkOrderLines` is **not** commutative in its reasons: an empty list short-circuits before the product check, and the two reasons map to *different* status codes downstream. Do not reorder.
- `isShippedItem` is the frozen, post-checkout twin of `@modules/cart`'s `isShippedLine` (`cart/domain/rules.ts`). Same predicate, different input shape (embedded product snapshot vs. joined cart line). Keep them in sync if the product schema's `requiresShipping` default changes.
- `buyerIdOf` returns `undefined` (not `null`, not `""`) when the buyer has been erased. Callers must treat `undefined` as "no account to charge/notify."
- All functions are pure and side-effect-free; safe to call in tests without mocking.
