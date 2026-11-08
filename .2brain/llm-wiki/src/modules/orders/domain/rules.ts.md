---
source: src/modules/orders/domain/rules.ts
sha256: ab8af8bbcf1e688cb3b6127817f38ee01854bac30a9a2555546b09023b55a925
generated_at: 2026-11-08T06:49:54.428857+00:00
model: ollama:qwen3.8:27b
---

# src/modules/orders/domain/rules.ts

## Purpose

Pure validation and classification predicates for order data. Functions take structured input and return a simple verdict or boolean — no side effects, no status codes, no i18n. The calling layer (primarily `services/place`) is responsible for translating verdicts into HTTP responses or user-facing messages.

## Key elements

- **`OrderLineCandidate`** — input shape for `checkOrderLines`; a line with an optional `quantity` and optional `product` (absent `product` means the reference no longer resolves).
- **`OrderLinesVerdict`** — discriminated union: `{ ok: true }` or `{ ok: false; reason: 'no-lines' | 'product-missing' }`.
- **`checkOrderLines(lines)`** — validates a set of candidate lines. Returns `no-lines` if empty, `product-missing` if any line lacks a resolvable product, otherwise `ok`.
- **`buyerIdOf(order)`** — normalises an order's `userId` (which may be an ObjectId or a plain string) into a `string | undefined`. The single canonical place where a buyer identity becomes a string.
- **`isBuyer(order, caller)`** — true only when the order has a resolvable buyer *and* that buyer matches `caller.id`. Returns false for erased buyers or missing caller identity.
- **`ShippableLineCandidate`** — minimal shape for `isShippedItem`; only reads `product.requiresShipping`.
- **`isShippedItem(line)`** — a line is shipped unless `product.requiresShipping === false`. Absent/`undefined` counts as shipped (the product schema default).
- **`isDigitalOnlyOrder(lines)`** — true when the order has at least one line *and* every line is non-shipped. An empty line set is never digital-only.

## Relationships

- **`src/modules/orders/services/place.ts`** — the primary consumer of `checkOrderLines`; maps its verdict to HTTP status codes and i18n messages (per the module doc comment).
- **`src/modules/orders/domain/index.ts`** — domain barrel that re-exports this module's public API for other domain files and services.
- **`src/modules/orders/domain/tax.ts`**, **`src/modules/orders/domain/withdrawal.ts`** — sibling domain modules; may consume `buyerIdOf` / `isBuyer` for account-scoped logic.
- **`src/modules/orders/controllers/get-order.ts`**, **`src/modules/orders/services/cancel.ts`**, **`src/modules/orders/services/override.ts`** — order-side consumers of `isBuyer` / `buyerIdOf` for authorisation checks.
- **`src/modules/delivery/services/ensure.ts`**, **`src/modules/delivery/services/notice.ts`** — delivery-side consumers of `isShippedItem` / `isDigitalOnlyOrder` to decide whether a parcel is warranted.
- **`src/modules/invoicing/controllers/get-order-invoice.ts`**, **`src/modules/invoicing/controllers/get-order-credit-note.ts`**, **`src/modules/invoicing/services/for-caller.ts`** — invoicing-side consumers of `isBuyer` / `buyerIdOf` for caller-scoped access.
- **`src/modules/orders/emails.ts`**, **`src/modules/orders/services/notify.ts`**, **`src/modules/orders/services/actions.ts`** — notification/action consumers of `buyerIdOf` to address outgoing mail.

## Notes

- **Order of checks in `checkOrderLines` matters**: `no-lines` is evaluated before `product-missing` because the two reasons map to different status codes downstream.
- **`isShippedItem` is the frozen twin of `cart/domain/rules.ts`'s `isShippedLine`**: same predicate (`requiresShipping !== false`) applied to an embedded product snapshot rather than a joined cart line. The two shapes diverge post-checkout, so they cannot share a single function.
- **`HasBuyer` is intentionally non-exported** — it's a structural type accepted by `buyerIdOf` and `isBuyer`. Any object with a compatible `userId` field satisfies it; callers don't need to import the interface.
- **`buyerIdOf` returns `undefined` (not `null`)** for erased buyers; downstream code should treat `undefined` as "no buyer" rather than an empty string.
