---
source: src/modules/orders/domain/rules.ts
source_sha256: ff7a3b09331ebea23ec336d965fb09b2bbcdf8bb85cfb47dc067e83c5b28fa96
context_sha256: 04ae24929e1d4c9fe42935303a99074e815237049d24e763b291f6bbaad03d91
generated_at: 2026-11-22T06:12:46.632763+00:00
model: claude-code:claude-sonnet-5-5
---

# src/modules/orders/domain/rules.ts

## Purpose
Pure order rules: data in, verdict out. It has no status codes and no i18n. `../services/place` maps the verdicts to responses. The file covers order-line validation, buyer identification and ownership, and shipped vs. digital classification of lines.

## Key elements
- `OrderLineCandidate` – a line as the rules see it. A missing `product` means the reference no longer resolves.
- `OrderLinesVerdict` – `{ ok: true }`, or `{ ok: false, reason: 'no-lines' | 'product-missing' }`.
- `checkOrderLines(lines)` – refuses an empty set (`no-lines`) and any set where a line's `product` is `undefined` or `null` (`product-missing`). Otherwise it accepts.
- `buyerIdOf(order)` – returns the order's `userId` as a string, or `undefined` if it has none (erased account, or a walk-in order). It is the one place an order's buyer becomes a string.
- `isBuyer(order, caller)` – true only if the order has a buyer, the caller has an id, and the two match.
- `ShippableLineCandidate` – the only field the shipping predicates read: `product.requiresShipping`.
- `isShippedItem(line)` – true unless `product.requiresShipping === false`. A missing flag counts as shipped, matching the product schema default.
- `isDigitalOnlyOrder(lines)` – true only when there is at least one line and no line is shipped.

## Relationships
The graph lists many neighbors, but the file's own content shows only this link:
- `src/modules/orders/services/place.ts` consumes the `checkOrderLines` verdicts and maps them to status codes and messages.

The other neighbors (delivery, invoicing, `get-order`, `src/modules/orders/domain/index.ts`, `tax.ts`, `withdrawal.ts`, emails, and the cancel/notify/override/actions services) are related in the dependency graph. This file does not show how they use it.

## Notes
- The order of the checks in `checkOrderLines` matters, because the two reasons map to different status codes. `no-lines` is checked first.
- `buyerIdOf` accepts `userId` as a string or an ObjectId-like value with `toString`. A falsy `userId` gives `undefined`.
- `isBuyer` is false when the caller is `undefined`, which covers paths with no request behind them.
- `isShippedItem` is the post-checkout counterpart of `isShippedLine` in the cart module's domain rules. It applies the same predicate to an order's embedded product snapshot.
- For digital-only orders, `ship` and `deliver` have nothing to do, and `fulfill` is their route instead. An order with no lines is never digital-only.
